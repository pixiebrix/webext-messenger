import {Contract} from '../../../index';

export const sumContract: Contract<typeof sum> = {
  type: 'sum',
};
export async function sum(...addends: number[]): Promise<number> {
  return addends.reduce((a, b) => a + b);
}
