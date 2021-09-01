import { registerMethod } from "../../index";
import { backgroundOnly } from "./background/backgroundOnly";
import { getExtensionId } from "./background/getExtensionId";
import { sum } from "./background/sum";
import { sumIfMeta } from "./background/sumIfMeta";
import { throws } from "./background/throws";

registerMethod("getExtensionId", getExtensionId);
registerMethod("sum", sum);
registerMethod("sumIfMeta", sumIfMeta);
registerMethod("backgroundOnly", backgroundOnly);
registerMethod("throws", throws);
