export type MailContent = { subject: string; text: string; html: string };

// Email clients need literal colors; keep these aligned with frontend/src/styles/design-system.css.
const colors = {
  background: "#F3F3F4",
  surface: "#FFFFFF",
  subtle: "#EDEDEF",
  border: "#CDCDD2",
  ink: "#35353D",
  heading: "#000000",
  muted: "#5B5B64",
  primary: "#FF4B44",
};

/** Escape dynamic content before placing it in email HTML or an attribute. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

/** Render a brand-consistent, client-friendly email without external assets. */
function emailShell(heading: string, preheader: string, content: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(heading)} · LaLiga Fantasy Builder</title>
</head>
<body style="margin:0;padding:0;background:${colors.background};color:${colors.ink};font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:${colors.background};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;border-collapse:collapse;background:${colors.surface};border:1px solid ${colors.border};">
        <tr><td style="height:4px;background:${colors.primary};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 32px 28px;text-align:left;">
          <p style="margin:0 0 24px;color:${colors.muted};font-size:11px;font-weight:700;letter-spacing:1.4px;line-height:1.4;text-transform:uppercase;">LALIGA FANTASY BUILDER</p>
          <h1 style="margin:0 0 16px;color:${colors.heading};font-family:Impact,'Arial Narrow',Arial,sans-serif;font-size:32px;font-weight:400;letter-spacing:0.5px;line-height:1.2;text-transform:uppercase;">${escapeHtml(heading)}</h1>
          ${content}
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid ${colors.border};color:${colors.muted};font-size:12px;line-height:1.6;">
          Sent by LaLiga Fantasy Builder. This is an automated message; please do not reply.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Match the frontend's square coral primary action. */
function actionButton(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:24px 0;">
    <tr><td bgcolor="${colors.primary}" style="background:${colors.primary};">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 20px;border:1px solid ${colors.primary};background:${colors.primary};color:${colors.heading};font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;letter-spacing:0.3px;line-height:1.4;text-align:center;text-decoration:none;text-transform:uppercase;">${escapeHtml(label)}</a>
    </td></tr>
  </table>`;
}

/** Create the one-time email verification message. */
export function verificationMail(otp: string, appOrigin: string): MailContent {
  const verifyUrl = new URL("/verify-email", appOrigin).toString();
  const content = `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;">Enter this code to verify your email address and finish creating your account.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:${colors.subtle};border-left:4px solid ${colors.primary};">
      <tr><td style="padding:20px 16px;color:${colors.heading};font-family:Arial,Helvetica,sans-serif;font-size:30px;font-weight:700;letter-spacing:5px;line-height:1.3;text-align:center;white-space:nowrap;">${escapeHtml(otp)}</td></tr>
    </table>
    <p style="margin:16px 0 0;color:${colors.muted};font-size:13px;line-height:1.6;">The code expires in 10 minutes and can be used once.</p>
    ${actionButton(verifyUrl, "Enter code")}
    <p style="margin:0;color:${colors.muted};font-size:13px;line-height:1.6;">If you did not create a Fantasy Builder account, you can ignore this email.</p>`;
  return {
    subject: "Verify your email",
    text: `Your verification code is ${otp}. It expires in 10 minutes and can be used once.\nOpen ${verifyUrl} and enter your email and code.\nIf you did not create a Fantasy Builder account, ignore this email.`,
    html: emailShell("Verify your email", "Your verification code expires in 10 minutes.", content),
  };
}

/** Create the one-time password recovery message. */
export function passwordResetMail(url: string): MailContent {
  const content = `<p style="margin:0;font-size:15px;line-height:1.6;">Use the button below to choose a new password for your Fantasy Builder account.</p>
    ${actionButton(url, "Reset password")}
    <p style="margin:0 0 18px;color:${colors.muted};font-size:13px;line-height:1.6;">This link expires in 30 minutes and can be used once.</p>
    <p style="margin:0 0 8px;color:${colors.muted};font-size:12px;line-height:1.6;">If the button does not work, copy this link into your browser:</p>
    <p style="margin:0 0 24px;font-size:12px;line-height:1.6;overflow-wrap:anywhere;word-break:break-all;"><a href="${escapeHtml(url)}" style="color:${colors.ink};text-decoration:underline;">${escapeHtml(url)}</a></p>
    <p style="margin:0;color:${colors.muted};font-size:13px;line-height:1.6;">If you did not request a password reset, you can ignore this email.</p>`;
  return {
    subject: "Reset your password",
    text: `Reset your password using this one-time link (valid for 30 minutes):\n${url}\nIf you did not request this, ignore this email.`,
    html: emailShell("Reset your password", "Your password reset link expires in 30 minutes.", content),
  };
}

/** Create the one-time code sent to a proposed new email address. */
export function emailChangeMail(otp: string): MailContent {
  const content = `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;">Enter this code in Account settings to confirm your new email address.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:${colors.subtle};border-left:4px solid ${colors.primary};">
      <tr><td style="padding:20px 16px;color:${colors.heading};font-family:Arial,Helvetica,sans-serif;font-size:30px;font-weight:700;letter-spacing:5px;line-height:1.3;text-align:center;white-space:nowrap;">${escapeHtml(otp)}</td></tr>
    </table>
    <p style="margin:16px 0 0;color:${colors.muted};font-size:13px;line-height:1.6;">The code expires in 10 minutes and can be used once. If you did not request this change, you can ignore this email.</p>`;
  return {
    subject: "Confirm your new email",
    text: `Your email change code is ${otp}. It expires in 10 minutes and can be used once.\nEnter it in Account settings. If you did not request this change, ignore this email.`,
    html: emailShell("Confirm your new email", "Your email change code expires in 10 minutes.", content),
  };
}
