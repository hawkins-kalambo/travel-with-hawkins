export function buildOtpEmailHtml(options: { fullName: string; otp: string }) {
  const { fullName, otp } = options;
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Verify your email - Travel with Hawkins</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f6fb;color:#1c293b;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr>
        <td align="center" style="padding:24px 16px;">
          <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(15,63,120,0.12);">
            <tr>
              <td style="background:#0f3f78;padding:32px 32px 22px;color:#ffffff;text-align:center;">
                <h1 style="margin:0;font-size:28px;line-height:1.1;font-weight:900;">Verify your email</h1>
                <p style="margin:12px auto 0;max-width:480px;font-size:15px;line-height:1.6;color:rgba(255,255,255,0.92);">Enter this code to confirm your Travel with Hawkins account.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 24px;">
                <p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:#1c293b;">Hi <strong>${fullName}</strong>,</p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.75;color:#475569;">Use the verification code below to finish creating your account. This code expires in 10 minutes.</p>

                <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;">
                  <tr>
                    <td align="center" style="padding:24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;">
                      <p style="margin:0 0 10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#0f3f78;">Your verification code</p>
                      <p style="margin:0;font-size:36px;font-weight:900;letter-spacing:.3em;color:#0f172a;">${otp}</p>
                    </td>
                  </tr>
                </table>

                <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#64748b;">If you didn't create a Travel with Hawkins account, you can safely ignore this email.</p>
                <p style="margin:10px 0 0;font-size:13px;line-height:1.7;color:#64748b;">Need help? Contact us at <a href="mailto:contact@travelwithhawkins.com" style="color:#0f3f78;text-decoration:none;">contact@travelwithhawkins.com</a> or +265 989 127 308.</p>
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
