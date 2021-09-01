import {Contract} from '../../../index';

export const throwsContract: Contract<typeof throws> = {
  type: 'throws',
};
export async function throws(): Promise<never> {
  throw new Error('This my error');
}
