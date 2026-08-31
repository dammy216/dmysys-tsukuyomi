import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import * as reactThree from "@react-three/eslint-plugin";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // R3F 固有の落とし穴: useFrame 内で new / .clone() すると毎フレーム GC が走る。
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "@react-three": { rules: reactThree.rules } },
    rules: {
      "@react-three/no-clone-in-loop": "error",
      "@react-three/no-new-in-loop": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
