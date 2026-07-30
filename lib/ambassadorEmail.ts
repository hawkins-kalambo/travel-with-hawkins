export function buildAmbassadorWelcomeEmailHtml(options: {
  ambassadorName: string;
  email: string;
  loginUrl: string;
  referralCode: string;
  referralLink: string;
  temporaryPassword?: string;
}) {
  const { ambassadorName, email, loginUrl, referralCode, referralLink, temporaryPassword } = options;
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Welcome to Travel with Hawkins</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f6fb;color:#1c293b;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr>
        <td align="center" style="padding:24px 16px;">
          <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(15,63,120,0.12);">
            <tr>
              <td style="background:#0f3f78;padding:32px 32px 22px;color:#ffffff;text-align:center;">
                <h1 style="margin:0;font-size:28px;line-height:1.1;font-weight:900;">Welcome to Travel with Hawkins</h1>
                <p style="margin:12px auto 0;max-width:480px;font-size:15px;line-height:1.6;color:rgba(255,255,255,0.92);">You’ve been added as a Campus Ambassador. Here are your credentials and referral details.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 24px;">
                <p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:#1c293b;">Hi <strong>${ambassadorName}</strong>,</p>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.75;color:#475569;">Welcome to the Travel with Hawkins ambassador team. Use the details below to sign in, share your referral code, and start earning commission on student bookings.</p>

                <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;">
                  <tr>
                    <td style="padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;">
                      <p style="margin:0 0 10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#0f3f78;">Login information</p>
                      <p style="margin:0;font-size:15px;line-height:1.6;color:#0f172a;"><strong>Email:</strong> ${email}</p>
                      ${temporaryPassword ? `<p style="margin:8px 0 0;font-size:15px;line-height:1.6;color:#0f172a;"><strong>Temporary password:</strong> ${temporaryPassword}</p>` : `<p style="margin:8px 0 0;font-size:15px;line-height:1.6;color:#0f172a;">If you no longer have your temporary password, use the password reset flow on the login page.</p>`}
                    </td>
                  </tr>
                </table>

                <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:24px;border-collapse:collapse;">
                  <tr>
                    <td style="padding:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;">
                      <p style="margin:0 0 10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#0f3f78;">Referral details</p>
                      <p style="margin:0;font-size:15px;line-height:1.6;color:#0f172a;"><strong>Referral code:</strong> ${referralCode}</p>
                      <p style="margin:8px 0 0;font-size:15px;line-height:1.6;color:#0f172a;"><strong>Referral link:</strong><br /><a href="${referralLink}" style="color:#0f3f78;text-decoration:none;">${referralLink}</a></p>
                    </td>
                  </tr>
                </table>

                <div style="margin-top:28px;text-align:center;">
                  <a href="${loginUrl}" style="display:inline-block;padding:14px 24px;background:#0f3f78;color:#ffffff;font-size:15px;font-weight:700;border-radius:12px;text-decoration:none;">Sign in to your ambassador dashboard</a>
                </div>

                <div style="margin-top:32px;padding:20px;background:#f8fafc;border-radius:16px;">
                  <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#0f172a;">What you can do as an ambassador</p>
                  <ul style="margin:0;padding-left:20px;color:#475569;font-size:15px;line-height:1.75;">
                    <li>Share your referral code with students.</li>
                    <li>Track bookings, commissions, and campaign performance.</li>
                    <li>Receive notifications about payments and support updates.</li>
                  </ul>
                </div>

                <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#64748b;">Please change your password after logging in for the first time.</p>
                <p style="margin:10px 0 0;font-size:13px;line-height:1.7;color:#64748b;">Need help? Contact us at <a href="mailto:travelwithhawkins@gmail.com" style="color:#0f3f78;text-decoration:none;">travelwithhawkins@gmail.com</a> or +265 989 127 308.</p>
              </td>
            </tr>
            <tr>
              <td style="background:#0f3f78;padding:20px 32px;text-align:center;color:#ffffff;font-size:12px;line-height:1.5;">
                <p style="margin:0;">Travel with Hawkins | Safe journeys for students</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
