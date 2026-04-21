export interface User {
  name: string;
  email: string;
}

export const USERS: Record<string, User> = {
  'aditpass10': { name: 'Adit', email: 'aditmittal@berkeley.edu' },
  'srijaypass8': { name: 'Srijay', email: 'srijay_vejendla@berkeley.edu' },
  'asimpass9': { name: 'Asim', email: 'asim_ali@berkeley.edu' },
};

export function getUser(password: string): User | undefined {
  return USERS[password];
}
