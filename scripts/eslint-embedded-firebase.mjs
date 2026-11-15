import { resolve, dirname, relative, sep } from 'node:path';

const GUARDED = new Set(['auth', 'firestore', 'functions', 'storage']);
export const embeddedFirebaseRule = {
  meta: {
    type: 'problem', schema: [],
    messages: { singleton: "임베드 트리에서 Firebase 싱글턴 '{{names}}' 대신 주입한 FirebaseServices를 사용하세요." },
  },
  create(context) {
    const root = context.cwd ?? process.cwd();
    const isSingleton = source => {
      if (typeof source !== 'string') return false;
      const spec = source.replace(/[?#].*$/, '').replace(/\.[cm]?[jt]sx?$/, '');
      const absolute = spec.startsWith('.') ? resolve(dirname(context.filename), spec)
        : spec.startsWith('@/') ? resolve(root, 'src', spec.slice(2))
        : spec.startsWith('@shared/') ? resolve(root, 'shared', spec.slice(8))
        : spec.startsWith('/src/') ? resolve(root, spec.slice(1)) : null;
      return absolute !== null && relative(root, absolute).split(sep).join('/') === 'src/services/firebase';
    };
    const report = (node, names) => { if (names.length) context.report({ node, messageId: 'singleton', data: { names: names.join(', ') } }); };
    return {
      ImportDeclaration(node) {
        if (node.importKind === 'type' || !isSingleton(node.source.value)) return;
        report(node, node.specifiers.filter(s => s.importKind !== 'type').flatMap(s => s.type === 'ImportSpecifier'
          ? GUARDED.has(s.imported.name ?? s.imported.value) ? [s.imported.name ?? s.imported.value] : [] : ['*']));
      },
      ExportNamedDeclaration(node) {
        if (node.exportKind === 'type' || !isSingleton(node.source?.value)) return;
        report(node, node.specifiers.filter(s => s.exportKind !== 'type').flatMap(s => GUARDED.has(s.local.name ?? s.local.value) ? [s.local.name ?? s.local.value] : []));
      },
      ExportAllDeclaration(node) { if (node.exportKind !== 'type' && isSingleton(node.source.value)) report(node, ['*']); },
      ImportExpression(node) {
        const source = node.source.type === 'TemplateLiteral' && node.source.expressions.length === 0 ? node.source.quasis[0].value.cooked : node.source.value;
        if (isSingleton(source)) report(node, ['*']);
      },
    };
  },
};
