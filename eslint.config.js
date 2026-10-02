import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

const browserGlobals={
  AbortController:"readonly",Blob:"readonly",Document:"readonly",File:"readonly",FormData:"readonly",URL:"readonly",URLSearchParams:"readonly",atob:"readonly",btoa:"readonly",cancelAnimationFrame:"readonly",clearTimeout:"readonly",console:"readonly",document:"readonly",fetch:"readonly",indexedDB:"readonly",localStorage:"readonly",navigator:"readonly",requestAnimationFrame:"readonly",setInterval:"readonly",setTimeout:"readonly",window:"readonly"
};

export default [
  { ignores:["dist/**","node_modules/**"] },
  {
    files:["src/**/*.{js,jsx}","api/**/*.js","test/**/*.js"],
    languageOptions:{
      ecmaVersion:"latest",
      sourceType:"module",
      parserOptions:{ecmaFeatures:{jsx:true}},
      globals:{...browserGlobals,Buffer:"readonly",process:"readonly",Response:"readonly",crypto:"readonly",module:"readonly",require:"readonly"}
    },
    plugins:{react,"react-hooks":reactHooks},
    settings:{react:{version:"detect"}},
    rules:{
      ...js.configs.recommended.rules,
      "no-console":"off",
      "no-empty":"off",
      "no-unused-vars":"off",
      "no-undef":"off",
      "react/jsx-uses-vars":"error",
      "react/react-in-jsx-scope":"off",
      "react-hooks/rules-of-hooks":"error",
      "react-hooks/exhaustive-deps":"off"
    }
  }
];
