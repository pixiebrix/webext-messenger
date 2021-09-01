import {Contract} from '../../../index';

// This is not correct usage. It's only here for testing
export const notRegisteredContract: Contract<() => Promise<never>> = {
  type: 'notRegistered',
};
