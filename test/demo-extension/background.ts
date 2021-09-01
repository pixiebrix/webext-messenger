import {registerMethod} from '../../index';
import {
  backgroundOnly,
  getExtensionId,
  sum,
  sumIfMeta,
  throws,
} from './background-handlers';

registerMethod('getExtensionId', getExtensionId);
registerMethod('sum', sum);
registerMethod('sumIfMeta', sumIfMeta);
registerMethod('backgroundOnly', backgroundOnly);
registerMethod('throws', throws);
