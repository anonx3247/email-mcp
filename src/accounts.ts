export type SecurityMode = "ssl" | "starttls" | "none";

export interface AccountConfig {
  label: string;
  emailAddress: string;
  username: string;
  password: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: SecurityMode;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: SecurityMode;
  sslVerify: boolean;
  sentFolder: string;
}

export function loadAccounts(): AccountConfig[] {
  throw new Error("Not implemented");
}

export function resolveAccount(
  accounts: AccountConfig[],
  account: string | number | undefined
): AccountConfig {
  throw new Error("Not implemented");
}
