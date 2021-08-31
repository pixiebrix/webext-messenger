import {addHandler} from '../../index';
import {
  backgroundOnly,
  getExtensionId,
  sum,
  throws,
} from './background-handlers';

addHandler('getExtensionId', getExtensionId);
addHandler('sum', sum);
addHandler('backgroundOnly', backgroundOnly);
addHandler('throws', throws);
