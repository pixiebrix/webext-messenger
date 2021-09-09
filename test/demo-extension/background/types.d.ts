/* If you're using `skipLibCheck: true`, use a .ts file instead of a .d.ts file, or else it won't be type-checked */

import { sum } from "./sum";
import { throws } from "./throws";
import { sumIfMeta } from "./sumIfMeta";
import { notRegistered } from "./notRegistered";
import { getExtensionId } from "./getExtensionId";
import { backgroundOnly } from "./backgroundOnly";

declare global {
  // TODO: This interface can't actually guarantee that every type has a Method
  // Adding an index signature will break MessengerMethods’s usage, because any key
  // will just return Method even if not set.
  interface MessengerMethods {
    sum: typeof sum;
    throws: typeof throws;
    sumIfMeta: typeof sumIfMeta;
    notRegistered: typeof notRegistered;
    getExtensionId: typeof getExtensionId;
    backgroundOnly: typeof backgroundOnly;
  }
}
