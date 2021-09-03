import { getMethod } from "../../../index";

import { _sum } from "./sum";
import { _throws } from "./throws";
import { _sumIfMeta } from "./sumIfMeta";
import { _notRegistered } from "./notRegistered";
import { _getExtensionId } from "./getExtensionId";
import { _backgroundOnly } from "./backgroundOnly";

export const sum = getMethod<typeof _sum>("sum");
export const throws = getMethod<typeof _throws>("throws");
export const sumIfMeta = getMethod<typeof _sumIfMeta>("sumIfMeta");
export const notRegistered = getMethod<typeof _notRegistered>("notRegistered");
export const getExtensionId = getMethod<typeof _getExtensionId>(
  "getExtensionId"
);
export const backgroundOnly = getMethod<typeof _backgroundOnly>(
  "backgroundOnly"
);
