import { registerBackgroundOnly } from "./background/backgroundOnly";
import { registerGetExtensionId } from "./background/getExtensionId";
import { registerSum } from "./background/sum";
import { registerSumIfMeta } from "./background/sumIfMeta";
import { registerThrows } from "./background/throws";

registerBackgroundOnly();
registerGetExtensionId();
registerSum();
registerSumIfMeta();
registerThrows();
