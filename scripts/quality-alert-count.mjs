import ts from "typescript";
import path from "node:path";

function binds(name, text) {
  return ts.isIdentifier(name) ? name.text === text
    : name.elements.some(element => ts.isBindingElement(element) && binds(element.name, text));
}

/** Resolve only lexical declarations needed to distinguish the approved async dialog API. */
function declarationOf(node, name) {
  for (let scope = node.parent; scope; scope = scope.parent) {
    if (ts.isFunctionLike(scope)) {
      const parameter = scope.parameters.find(item => binds(item.name, name));
      if (parameter) return parameter;
    }
    if (ts.isCatchClause(scope) && scope.variableDeclaration && binds(scope.variableDeclaration.name, name)) return scope.variableDeclaration;
    if ((ts.isForStatement(scope) || ts.isForInStatement(scope) || ts.isForOfStatement(scope))
      && scope.initializer && ts.isVariableDeclarationList(scope.initializer)) {
      const declaration = scope.initializer.declarations.find(item => binds(item.name, name));
      if (declaration) return declaration;
    }
    if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) continue;
    for (const statement of scope.statements) {
      if (ts.isVariableStatement(statement)) {
        const declaration = statement.declarationList.declarations.find(item => binds(item.name, name));
        if (declaration) return declaration;
      }
      if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name?.text === name) return statement;
      if (ts.isImportDeclaration(statement)) {
        const bindings = statement.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          const specifier = bindings.elements.find(item => item.name.text === name);
          if (specifier) return specifier;
        }
      }
    }
  }
  return null;
}

export function countAlertCalls(text, filename = "source.tsx") {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true,
    filename.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const approvedImports = new Set();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)
      || !statement.moduleSpecifier.text.startsWith(".")) continue;
    const importedFile = path.resolve(path.dirname(filename), statement.moduleSpecifier.text).replace(/\.tsx?$/, "");
    if (importedFile !== path.resolve("src/contexts/DialogContext")) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const item of bindings.elements) if ((item.propertyName ?? item.name).text === "useDialog") approvedImports.add(item);
    }
  }
  // Any explicit write to a same-named receiver is suspicious, even in another scope.
  const mutatedReceivers = new Set();
  const collectWrites = node => {
    const target = ts.isBinaryExpression(node)
      && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment ? node.left
      : (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
        && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)
        ? node.operand : ts.isDeleteExpression(node) ? node.expression : null;
    if (target && (ts.isPropertyAccessExpression(target) && target.name.text === "alert"
      || ts.isElementAccessExpression(target) && target.argumentExpression
        && ts.isStringLiteralLike(target.argumentExpression) && target.argumentExpression.text === "alert")
      && ts.isIdentifier(target.expression)) mutatedReceivers.add(target.expression.text);
    ts.forEachChild(node, collectWrites);
  };
  collectWrites(source);
  const isAsyncDialog = receiver => {
    if (!ts.isIdentifier(receiver) || mutatedReceivers.has(receiver.text)) return false;
    const declaration = declarationOf(receiver, receiver.text);
    if (!declaration || !ts.isVariableDeclaration(declaration) || !ts.isIdentifier(declaration.name)
      || !(declaration.parent.flags & ts.NodeFlags.Const)) return false;
    const initializer = declaration.initializer;
    return !!initializer && ts.isCallExpression(initializer) && ts.isIdentifier(initializer.expression)
      && approvedImports.has(declarationOf(initializer.expression, initializer.expression.text));
  };
  let count = 0;
  const visit = node => {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      if (ts.isIdentifier(expression) && expression.text === "alert") count += 1;
      else if (ts.isPropertyAccessExpression(expression) && expression.name.text === "alert"
        && !isAsyncDialog(expression.expression)) count += 1;
      else if (ts.isElementAccessExpression(expression) && expression.argumentExpression
        && ts.isStringLiteralLike(expression.argumentExpression) && expression.argumentExpression.text === "alert"
        && !isAsyncDialog(expression.expression)) count += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return count;
}
