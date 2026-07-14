export interface AuthResult { token: string; email: string; displayName: string; role: string; }
export interface Credentials { email: string; password: string; }
export interface RegisterInput extends Credentials { displayName: string; }
