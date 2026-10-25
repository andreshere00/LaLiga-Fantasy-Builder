import { createAuthClient } from "better-auth/react";
import { emailOTPClient, jwtClient, usernameClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  basePath: "/auth",
  plugins: [jwtClient(), usernameClient(), emailOTPClient()],
});
