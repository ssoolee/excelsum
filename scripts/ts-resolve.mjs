// 개발용 검증 스크립트가 src/의 확장자 없는 상대 경로 import("./cfb")를 그대로 쓰도록 돕는다.
// 번들러(Next)는 확장자를 알아서 붙이지만 Node ESM은 붙이지 않아, 못 찾으면 ".ts"를 붙여 다시 찾는다.
import { register } from "node:module";

register("./ts-resolve-hooks.mjs", import.meta.url);
