import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import {fileURLToPath} from "node:url";
import {realpathSync} from "node:fs";
const root=fileURLToPath(new URL("../",import.meta.url));
export default defineConfig({root,plugins:[react(),tailwindcss()],resolve:{alias:[{find:/^(?:.*\/)?usePowerEffortPreferences$/,replacement:fileURLToPath(new URL("./power-effort-hook.tsx",import.meta.url))},{find:"@shared",replacement:root+"shared"}]},server:{host:"127.0.0.1",port:5188,strictPort:true,fs:{allow:[root,realpathSync(root+"node_modules/pretendard"),realpathSync(root+"node_modules/@fontsource/jetbrains-mono")]}}});
