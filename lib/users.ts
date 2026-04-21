export interface User {
  name: string;
  email: string;
  isAdmin?: boolean;
}

export const USERS: Record<string, User> = {
  'aditpass10': { name: 'Adit', email: 'aditmittal@berkeley.edu', isAdmin: true },
  'srijaypass8': { name: 'Srijay', email: 'srijay_vejendla@berkeley.edu' },
  'asimpass9': { name: 'Asim', email: 'asim_ali@berkeley.edu' },
};

export function getUser(password: string): User | undefined {
  return USERS[password];
}

export function getAllPasswords(): string[] {
  return Object.keys(USERS);
}

export function getUserByPassword(password: string): User | undefined {
  return USERS[password];
}
