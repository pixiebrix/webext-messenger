import { _sum } from "./sum";
import { _throws } from "./throws";
import { _sumIfMeta } from "./sumIfMeta";
import { _notRegistered } from "./notRegistered";
import { _getExtensionId } from "./getExtensionId";
import { _backgroundOnly } from "./backgroundOnly";

export interface MessengerMethods {
  sum: typeof _sum;
  throws: typeof _throws;
  sumIfMeta: typeof _sumIfMeta;
  notRegistered: typeof _notRegistered;
  getExtensionId: typeof _getExtensionId;
  backgroundOnly: typeof _backgroundOnly;
}
