/** Translate provider errors without exposing technical authentication details. */
export function authMessage(error:unknown){
 const message=error instanceof Error?error.message:'';
 if(/email not confirmed|email_not_confirmed/i.test(message))return 'Your account has been created, but your email is not confirmed. Look for an email from no-reply@netlify.com in Inbox or Spam, open its confirmation link, then sign in again. If it is missing, use Resend confirmation email below.';
 if(/invalid.grant|invalid login|invalid credentials/i.test(message))return 'The email address or password is incorrect. Check your details, or use Forgot password.';
 if(/already registered|already exists/i.test(message))return 'An account already exists for this email. Confirm the email if needed, then sign in or use Forgot password.';
 if(/rate.limit|too many requests|429/i.test(message))return 'Too many attempts. Please wait a few minutes before trying again.';
 if(/signup.*disabled|signups.*not allowed|registration.*disabled/i.test(message))return 'Account registration is unavailable. Contact your school administrator.';
 if(/expired|invalid.*token/i.test(message))return 'This email link is invalid or has expired. Request a new password reset link or contact your school administrator.';
 if(/passwords do not match/i.test(message))return 'Passwords do not match.';
 if(/password.*(short|length|characters)/i.test(message))return 'Use a password with at least 12 characters.';
 if(error instanceof TypeError||/network|fetch|timed? ?out/i.test(message))return 'Unable to reach secure sign-in. Check your internet connection and try again.';
 return 'Unable to complete sign-in. Please try again, or contact your school administrator if this continues.';
}
