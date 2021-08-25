import {createMessenger} from '../../index';
import {getExtensionIdContract} from './background-handlers';

const getExtensionId = createMessenger(getExtensionIdContract);

void getExtensionId().then((x) => {
  console.log(x);
});
