export interface User {
  name: string;
  email: string;
}

export const USERS: Record<string, User> = {
  '7722': { name: 'Adit', email: 'aditmittal@berkeley.edu' },
  '3490': { name: 'Srijay', email: 'srijay_vejendla@berkeley.edu' },
  '5514': { name: 'Asim', email: 'asim_ali@berkeley.edu' },
};

export function getUser(pin: string): User | undefined {
  return USERS[pin];
}
