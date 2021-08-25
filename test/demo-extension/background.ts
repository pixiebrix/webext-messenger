import {addHandler} from '../../index';
import {getExtensionId} from './background-handlers';

addHandler('getExtensionId', getExtensionId);
