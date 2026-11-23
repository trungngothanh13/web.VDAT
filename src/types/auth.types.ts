export type Role = 'ADMIN' | 'POLICE';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

