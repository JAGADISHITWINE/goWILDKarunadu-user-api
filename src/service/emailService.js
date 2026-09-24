const nodemailer = require("nodemailer");
const db = require("../config/db");
require("dotenv").config();

async function getBrandSettings() {
  try {
    const [rows] = await db.query("SELECT setting_key, setting_value FROM settings");
    const map = {};
    for (const r of (rows || [])) {
      map[r.setting_key] = r.setting_value;
    }
    return {
      brandName: map.brand_name || "goWILD Karunadu",
      brandSubtitle: map.brand_subtitle || "ಕರುನಾಡು",
      brandTagline: map.brand_tagline || "Explore • Trek • Experience",
      supportPhone: map.support_phone || "+91 98765 43210",
      supportEmail: map.support_email || "info@gowildkarunadu.com",
      legalName: map.legal_name || "goWILD Karunadu Eco-Adventures Pvt Ltd"
    };
  } catch (err) {
    return {
      brandName: "goWILD Karunadu",
      brandSubtitle: "ಕರುನಾಡು",
      brandTagline: "Explore • Trek • Experience",
      supportPhone: "+91 98765 43210",
      supportEmail: "info@gowildkarunadu.com",
      legalName: "goWILD Karunadu Eco-Adventures Pvt Ltd"
    };
  }
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  pool: true,
  maxConnections: 1,
  maxMessages: 25,
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
  auth: {
    user: process.env.SMTP_USER, // Your email
    pass: String(process.env.SMTP_PASS || "").replace(/\s+/g, ""), // Gmail app passwords are often copied with spaces
  },
});

// ── Booking confirmation ─────────────────────────────────────────────
async function sendBookingConfirmation(booking) {
  try {
    const brand = await getBrandSettings();
    const startDate = new Date(booking.start_date).toLocaleDateString("en-IN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const endDate = new Date(booking.end_date).toLocaleDateString("en-IN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Participants table, brand-matched
    let participantsSectionHtml = "";
    if (
      booking.participants_details &&
      booking.participants_details.length > 0
    ) {
      const rows = booking.participants_details
        .map(
          (p, i) => `
        <tr style="${i % 2 === 0 ? "background:#f9fbf8;" : "background:#fff;"}">
          <td style="padding:9px 10px;border:1px solid #e4e9e4;font-size:12px;">${i + 1}</td>
          <td style="padding:9px 10px;border:1px solid #e4e9e4;font-size:12px;">
            ${p.name}
            ${p.is_primary_contact ? '<span style="background:#e5f2e7;color:#28613b;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:bold;margin-left:6px;">PRIMARY</span>' : ""}
          </td>
          <td style="padding:9px 10px;border:1px solid #e4e9e4;font-size:12px;">${p.age || "-"}</td>
          <td style="padding:9px 10px;border:1px solid #e4e9e4;font-size:12px;">${p.gender || "-"}</td>
          <td style="padding:9px 10px;border:1px solid #e4e9e4;font-size:12px;">${p.id_type || "-"}</td>
          <td style="padding:9px 10px;border:1px solid #e4e9e4;font-size:12px;">${p.id_number || "-"}</td>
          <td style="padding:9px 10px;border:1px solid #e4e9e4;font-size:12px;">${p.phone || "-"}</td>
        </tr>`,
        )
        .join("");

      participantsSectionHtml = `
      <tr><td style="padding:8px 30px 18px;">
        <div style="font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#78847b;padding-bottom:9px;border-bottom:1px solid #e7ebe7;margin-bottom:10px;">Participant Details</div>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead>
            <tr style="background:#173b29;">
              <th style="padding:9px 10px;color:#fff;font-size:11px;text-align:left;">#</th>
              <th style="padding:9px 10px;color:#fff;font-size:11px;text-align:left;">Name</th>
              <th style="padding:9px 10px;color:#fff;font-size:11px;text-align:left;">Age</th>
              <th style="padding:9px 10px;color:#fff;font-size:11px;text-align:left;">Gender</th>
              <th style="padding:9px 10px;color:#fff;font-size:11px;text-align:left;">ID Type</th>
              <th style="padding:9px 10px;color:#fff;font-size:11px;text-align:left;">ID Number</th>
              <th style="padding:9px 10px;color:#fff;font-size:11px;text-align:left;">Phone</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin-top:12px;font-size:11px;color:#78847b;">All participants must carry the ID proof mentioned above during the trek.</p>
      </td></tr>`;
    }

    // Medical info, brand-matched (kept visually distinct — safety callout)
    let medicalSectionHtml = "";
    if (
      booking.participants_details &&
      booking.participants_details.length > 0
    ) {
      const withMedical = booking.participants_details.filter(
        (p) => p.medical_info && p.medical_info.trim() !== "",
      );
      if (withMedical.length > 0) {
        const rows = withMedical
          .map(
            (p) => `
          <div style="padding:10px 12px;background:#fff;border-left:3px solid #d9534f;margin-bottom:8px;border-radius:4px;font-size:12px;">
            <b>${p.name}:</b> ${p.medical_info}
          </div>`,
          )
          .join("");
        medicalSectionHtml = `
        <tr><td style="padding:0 30px 18px;">
          <div style="background:#fdecea;border:1px solid #f3b3ac;border-radius:9px;padding:16px;">
            <div style="font-size:14px;font-weight:bold;color:#a33b32;margin-bottom:8px;">Medical Information</div>
            <p style="margin:0 0 10px;font-size:12px;color:#7a4a44;">Trek leaders have been informed of the following:</p>
            ${rows}
          </div>
        </td></tr>`;
      }
    }

    // Add-ons / special requests, brand-matched
    let extrasHtml = "";
    if (booking.addons_summary) {
      extrasHtml += `
      <tr><td style="padding:0 30px 18px;">
        <div style="background:#fafcf9;border:1px solid #e4eae4;border-radius:9px;padding:16px;">
          <div style="font-size:13px;font-weight:bold;color:#173b29;margin-bottom:6px;">Selected Add-ons</div>
          <div style="font-size:12px;color:#4e564f;">${booking.addons_summary}</div>
        </div>
      </td></tr>`;
    }
    if (booking.special_requests) {
      extrasHtml += `
      <tr><td style="padding:0 30px 18px;">
        <div style="background:#fafcf9;border:1px solid #e4eae4;border-radius:9px;padding:16px;">
          <div style="font-size:13px;font-weight:bold;color:#173b29;margin-bottom:6px;">Special Requests</div>
          <div style="font-size:12px;color:#4e564f;">${booking.special_requests}</div>
        </div>
      </td></tr>`;
    }

    const medicalDisclosedNote =
      booking.participants_details &&
      booking.participants_details.some((p) => p.medical_info)
        ? "<li>Our trek leaders have been informed about the medical conditions noted above.</li>"
        : "";

    const bodyRows = `
      ${emailHeader("BOOKING CONFIRMED", "#e5f2e7", "#28613b", brand)}

      <tr><td style="padding:30px;">
        <div style="font-size:13px;color:#758078;">Hello ${booking.customer_name},</div>
        <div style="font-size:28px;font-weight:bold;color:#173b29;margin-top:6px;">Your adventure is confirmed! 🎉</div>
        <div style="font-size:13px;line-height:21px;color:#68746d;margin-top:8px;">Thank you for choosing ${brand.brandName}. Your trek booking has been successfully confirmed.</div>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;background:#f0f6ef;border:1px solid #dce8dc;border-radius:9px;">
          <tr>
            <td style="padding:14px 16px;">
              <div style="font-size:10px;color:#78847b;text-transform:uppercase;letter-spacing:1px;">Booking Reference</div>
              <div style="font-size:19px;font-weight:bold;color:#173b29;margin-top:5px;">${booking.booking_reference}</div>
            </td>
            <td align="right" style="padding:14px 16px;">
              <div style="font-size:10px;color:#78847b;text-transform:uppercase;letter-spacing:1px;">Status</div>
              <div style="font-size:13px;font-weight:bold;color:#2e7d32;margin-top:5px;">✓ Confirmed</div>
            </td>
          </tr>
        </table>
      </td></tr>

      <tr><td style="padding:0 30px 18px;">
        <div style="font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#78847b;padding-bottom:9px;border-bottom:1px solid #e7ebe7;">Trek Details</div>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="50%" style="padding:14px 8px 12px 0;border-bottom:1px solid #edf0ed;"><div style="font-size:10px;color:#89928b;">TREK</div><div style="font-size:14px;font-weight:bold;margin-top:4px;">${booking.trek_name}</div></td>
            <td width="50%" style="padding:14px 0 12px 8px;border-bottom:1px solid #edf0ed;"><div style="font-size:10px;color:#89928b;">PARTICIPANTS</div><div style="font-size:14px;font-weight:bold;margin-top:4px;">${booking.participants} person(s)</div></td>
          </tr>
          <tr>
            <td style="padding:14px 8px 5px 0;"><div style="font-size:10px;color:#89928b;">START DATE</div><div style="font-size:14px;font-weight:bold;margin-top:4px;">${startDate}</div></td>
            <td style="padding:14px 0 5px 8px;"><div style="font-size:10px;color:#89928b;">END DATE</div><div style="font-size:14px;font-weight:bold;margin-top:4px;">${endDate}</div></td>
          </tr>
        </table>
      </td></tr>

      ${participantsSectionHtml}
      ${medicalSectionHtml}
      ${extrasHtml}

      <tr><td style="padding:8px 30px;">
        <div style="background:#fafcf9;border:1px solid #e4eae4;border-radius:9px;padding:16px;">
          <div style="font-size:14px;font-weight:bold;color:#173b29;margin-bottom:10px;">Participant Contact</div>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="font-size:12px;color:#78837b;padding:4px 0;">Email</td><td align="right" style="font-size:12px;padding:4px 0;">${booking.customer_email}</td></tr>
            <tr><td style="font-size:12px;color:#78837b;padding:4px 0;">Phone</td><td align="right" style="font-size:12px;padding:4px 0;">${booking.customer_phone}</td></tr>
            <tr><td style="font-size:12px;color:#78837b;padding:4px 0;">Emergency Contact</td><td align="right" style="font-size:12px;padding:4px 0;">${booking.emergency_contact}</td></tr>
          </table>
        </div>
      </td></tr>

      <tr><td style="padding:18px 30px 8px;">
        <div style="font-size:14px;font-weight:bold;color:#173b29;margin-bottom:10px;">Payment Summary</div>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e9e4;border-radius:9px;overflow:hidden;">
          <tr><td style="padding:10px 13px;border-bottom:1px solid #edf0ed;font-size:12px;color:#69746d;">Base Price</td><td align="right" style="padding:10px 13px;border-bottom:1px solid #edf0ed;font-size:12px;">₹${parseFloat(booking.base_price).toFixed(2)}</td></tr>
          <tr><td style="padding:10px 13px;border-bottom:1px solid #edf0ed;font-size:12px;color:#69746d;">Add-ons</td><td align="right" style="padding:10px 13px;border-bottom:1px solid #edf0ed;font-size:12px;">₹${parseFloat(booking.addons_total).toFixed(2)}</td></tr>
          <tr><td style="padding:10px 13px;border-bottom:1px solid #edf0ed;font-size:12px;color:#69746d;">Subtotal</td><td align="right" style="padding:10px 13px;border-bottom:1px solid #edf0ed;font-size:12px;">₹${parseFloat(booking.subtotal).toFixed(2)}</td></tr>
          <tr><td style="padding:10px 13px;font-size:12px;color:#69746d;">Tax (5%)</td><td align="right" style="padding:10px 13px;font-size:12px;">₹${parseFloat(booking.tax_amount).toFixed(2)}</td></tr>
          <tr><td style="padding:14px;background:#173b29;color:#fff;font-weight:bold;font-size:13px;">Total Amount</td><td align="right" style="padding:14px;background:#173b29;color:#fff;font-size:19px;font-weight:bold;">₹${parseFloat(booking.total_amount).toFixed(2)}</td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:18px 30px;">
        <div style="background:#fff9e8;border:1px solid #efd487;border-radius:9px;padding:16px;">
          <div style="font-size:14px;font-weight:bold;color:#6b5112;margin-bottom:8px;">Important Before Your Trek</div>
          <ul style="margin:0;padding-left:18px;font-size:11px;line-height:19px;color:#4e4e45;">
            <li>Payment must be completed by <b>${new Date(booking.payment_deadline).toLocaleDateString("en-IN")}</b>.</li>
            <li>All participants must carry the ID proof mentioned in participant details.</li>
            <li>Arrive at the meeting point 30 minutes before departure.</li>
            <li>Check weather conditions before the trek.</li>
            <li>Wear appropriate trekking shoes and comfortable clothing.</li>
            <li>Carry sufficient water and energy snacks.</li>
            ${medicalDisclosedNote}
          </ul>
        </div>
      </td></tr>

      <tr><td align="center" style="padding:12px 30px 28px;">
        <div style="font-size:15px;font-weight:bold;color:#173b29;">Need help with your booking?</div>
        <div style="font-size:12px;color:#748078;margin:6px 0 15px;">Our support team is happy to help with your trek, payment or batch details.</div>
        <a href="mailto:${brand.supportEmail}" style="background:#2d633d;color:#fff;text-decoration:none;padding:11px 21px;border-radius:7px;font-size:12px;font-weight:bold;">CONTACT SUPPORT</a>
      </td></tr>

      ${emailFooter(brand)}
    `;

    const emailHtml = emailShell(bodyRows);

    let participantsText = "";
    if (
      booking.participants_details &&
      booking.participants_details.length > 0
    ) {
      participantsText =
        "\n\nParticipant Details:\n" +
        booking.participants_details
          .map(
            (p, i) =>
              `${i + 1}. ${p.name}${p.is_primary_contact ? " (Primary Contact)" : ""}\n` +
              `   Age: ${p.age || "-"}, Gender: ${p.gender || "-"}\n` +
              `   ID: ${p.id_type || "-"} - ${p.id_number || "-"}\n` +
              `   Phone: ${p.phone || "-"}\n` +
              (p.medical_info ? `   Medical Info: ${p.medical_info}\n` : ""),
          )
          .join("\n");
    }

    const mailOptions = {
      from: `"${brand.brandName}" <${process.env.SMTP_USER}>`,
      to: booking.customer_email,
      subject: `Booking Confirmed - ${booking.trek_name} (${booking.booking_reference})`,
      html: emailHtml,
      text: `
        Booking Confirmed!

        Dear ${booking.customer_name},

        Your trek booking has been successfully confirmed.

        Booking Reference: ${booking.booking_reference}
        Trek: ${booking.trek_name}
        Start Date: ${startDate}
        End Date: ${endDate}
        Participants: ${booking.participants}
        ${participantsText}

        Payment Summary:
        - Base Price: ₹${booking.base_price}
        - Add-ons: ₹${booking.addons_total}
        - Subtotal: ₹${booking.subtotal}
        - Tax (5%): ₹${booking.tax_amount}
        - Total Amount: ₹${booking.total_amount}

        Payment Deadline: ${new Date(booking.payment_deadline).toLocaleDateString("en-IN")}

        IMPORTANT:
        - All participants must carry their ID proof
        - Arrive 30 minutes before departure
        - Check weather conditions before the trek

        Thank you for choosing ${brand.brandName}!

        Best regards,
        ${brand.brandName} Team

        ---
        Support: ${brand.supportEmail} | ${brand.supportPhone}
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(
      `✓ Confirmation email sent to ${booking.customer_email} (Message ID: ${info.messageId})`,
    );
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Email sending error:", error);
    throw error;
  }
}

// ── Cancellation ──────────────────────────────────────────────────────
async function sendCancellationEmail(booking) {
  try {
    const startDate = new Date(booking.start_date).toLocaleDateString("en-IN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    let participantsRows = "";
    if (
      booking.participants_details &&
      booking.participants_details.length > 0
    ) {
      participantsRows = booking.participants_details
        .map(
          (p, i) => `
        <tr style="${i % 2 === 0 ? "background:#f9fbf8;" : "background:#fff;"}">
          <td style="padding:9px 10px;border:1px solid #e4e9e4;font-size:12px;">${i + 1}</td>
          <td style="padding:9px 10px;border:1px solid #e4e9e4;font-size:12px;">${p.name}</td>
          <td style="padding:9px 10px;border:1px solid #e4e9e4;font-size:12px;">${p.age || "-"}</td>
          <td style="padding:9px 10px;border:1px solid #e4e9e4;font-size:12px;">${p.gender || "-"}</td>
        </tr>`,
        )
        .join("");
    }

    const bodyRows = `
      ${emailHeader("BOOKING CANCELLED", "#fdecea", "#b3261e")}

      <tr><td style="padding:30px;">
        <div style="font-size:13px;color:#758078;">Hello ${booking.customer_name},</div>
        <div style="font-size:24px;font-weight:bold;color:#173b29;margin-top:6px;">Your booking has been cancelled</div>
        <div style="font-size:13px;line-height:21px;color:#68746d;margin-top:8px;">Your booking has been cancelled as requested. Details are below.</div>
      </td></tr>

      <tr><td style="padding:0 30px 18px;">
        <div style="font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#78847b;padding-bottom:9px;border-bottom:1px solid #e7ebe7;">Cancelled Booking</div>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="50%" style="padding:14px 8px 12px 0;border-bottom:1px solid #edf0ed;"><div style="font-size:10px;color:#89928b;">TREK</div><div style="font-size:14px;font-weight:bold;margin-top:4px;">${booking.trek_name}</div></td>
            <td width="50%" style="padding:14px 0 12px 8px;border-bottom:1px solid #edf0ed;"><div style="font-size:10px;color:#89928b;">PARTICIPANTS</div><div style="font-size:14px;font-weight:bold;margin-top:4px;">${booking.participants}</div></td>
          </tr>
          <tr>
            <td style="padding:14px 8px 5px 0;" colspan="2"><div style="font-size:10px;color:#89928b;">TREK DATE</div><div style="font-size:14px;font-weight:bold;margin-top:4px;">${startDate}</div></td>
          </tr>
        </table>
      </td></tr>

      ${
        participantsRows
          ? `
      <tr><td style="padding:0 30px 18px;">
        <div style="font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#78847b;padding-bottom:9px;border-bottom:1px solid #e7ebe7;margin-bottom:10px;">Cancelled Participants</div>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead>
            <tr style="background:#173b29;">
              <th style="padding:9px 10px;color:#fff;font-size:11px;text-align:left;">#</th>
              <th style="padding:9px 10px;color:#fff;font-size:11px;text-align:left;">Name</th>
              <th style="padding:9px 10px;color:#fff;font-size:11px;text-align:left;">Age</th>
              <th style="padding:9px 10px;color:#fff;font-size:11px;text-align:left;">Gender</th>
            </tr>
          </thead>
          <tbody>${participantsRows}</tbody>
        </table>
      </td></tr>`
          : ""
      }

      <tr><td style="padding:8px 30px 24px;">
        <div style="background:#fafcf9;border:1px solid #e4eae4;border-radius:9px;padding:16px;">
          <div style="font-size:14px;font-weight:bold;color:#173b29;margin-bottom:10px;">Refund Details</div>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="font-size:12px;color:#78837b;padding:4px 0;">Total Amount</td><td align="right" style="font-size:12px;padding:4px 0;">₹${booking.total_amount}</td></tr>
            <tr><td style="font-size:12px;color:#78837b;padding:4px 0;">Cancellation Fee</td><td align="right" style="font-size:12px;padding:4px 0;">₹${booking.cancellation_fee}</td></tr>
            <tr><td style="font-size:13px;font-weight:bold;color:#173b29;padding:8px 0 0;">Refund Amount</td><td align="right" style="font-size:15px;font-weight:bold;color:#2e7d32;padding:8px 0 0;">₹${booking.refund_amount} (${booking.refund_percentage}%)</td></tr>
          </table>
          <div style="font-size:11px;color:#89928b;margin-top:10px;">Processing time: 7–10 business days.</div>
        </div>
      </td></tr>

      ${emailFooter(brand)}
    `;

    const mailOptions = {
      from: `"${brand.brandName}" <${process.env.SMTP_USER}>`,
      to: booking.customer_email,
      subject: `Booking Cancelled - ${booking.booking_reference}`,
      html: emailShell(bodyRows),
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Cancellation email error:", error);
    throw error;
  }
}

// ── Password reset ───────────────────────────────────────────────────
async function sendPasswordResetEmail(toEmail, resetLink, userName) {
  const brand = await getBrandSettings();
  const bodyRows = `
    ${emailHeader("PASSWORD RESET", "#e5f2e7", "#28613b", brand)}
    <tr><td style="padding:30px;">
      <div style="font-size:22px;font-weight:bold;color:#173b29;">Reset your password</div>
      <p style="font-size:13px;line-height:21px;color:#68746d;margin-top:10px;">Hi <b>${userName}</b>, we received a request to reset the password for your ${brand.brandName} account.</p>
      <div style="text-align:center;margin:26px 0;">
        <a href="${resetLink}" style="background:#2d633d;color:#fff;text-decoration:none;padding:13px 30px;border-radius:7px;font-size:13px;font-weight:bold;display:inline-block;">RESET MY PASSWORD</a>
      </div>
      <p style="font-size:12px;color:#89928b;">Or copy and paste this link into your browser:</p>
      <p style="font-size:12px;word-break:break-all;color:#2d633d;">${resetLink}</p>
      <div style="background:#fff9e8;border:1px solid #efd487;border-radius:9px;padding:14px 16px;margin-top:16px;font-size:12px;color:#6b5112;">
        ⚠️ This link expires in <b>1 hour</b>. If you did not request this, you can safely ignore this email.
      </div>
    </td></tr>
    ${emailFooter(brand)}
  `;

  const mailOptions = {
    from: `"${brand.brandName}" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: "Password Reset Request",
    html: emailShell(bodyRows),
  };

  await transporter.sendMail(mailOptions);
}

// ── OTP verification ─────────────────────────────────────────────────
async function sendOtpEmail(toEmail, otp, userName) {
  const brand = await getBrandSettings();
  const bodyRows = `
    ${emailHeader("VERIFY EMAIL", "#e5f2e7", "#28613b", brand)}
    <tr><td style="padding:30px;text-align:center;">
      <div style="font-size:22px;font-weight:bold;color:#173b29;">Verify your email</div>
      <p style="font-size:13px;line-height:21px;color:#68746d;margin-top:10px;">Hi <b>${userName}</b>, use the code below to verify your email:</p>
      <div style="display:inline-block;background:#f0f6ef;border:2px dashed #2d633d;border-radius:12px;padding:18px 36px;margin:22px 0;">
        <div style="font-size:38px;font-weight:900;letter-spacing:10px;color:#173b29;font-family:monospace;">${otp}</div>
      </div>
      <p style="font-size:12px;color:#89928b;">This code expires in <b>10 minutes</b>.</p>
      <div style="background:#fff9e8;border:1px solid #efd487;border-radius:9px;padding:14px 16px;margin-top:14px;font-size:12px;color:#6b5112;text-align:left;">
        ⚠️ Do not share this code with anyone. If you did not request this, please ignore this email.
      </div>
    </td></tr>
    ${emailFooter(brand)}
  `;

  const mailOptions = {
    from: `"${brand.brandName}" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: "Your Email Verification OTP",
    html: emailShell(bodyRows),
  };

  await transporter.sendMail(mailOptions);
}

// ── Shared brand chrome ──────────────────────────────────────────────
function emailHeader(
  statusLabel,
  statusBg = "#e5f2e7",
  statusColor = "#28613b",
  brand = {}
) {
  const brandName = brand.brandName || "goWILD Karunadu";
  const brandTagline = brand.brandTagline || "Explore • Trek • Experience";
  return `
    <tr><td style="background:#173b29;padding:24px 30px;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td>
          <div style="font-size:23px;font-weight:bold;color:#fff;">${brandName}</div>
          <div style="font-size:11px;color:#c9d8cd;margin-top:4px;">${brandTagline}</div>
        </td>
        <td align="right">
          <span style="background:${statusBg};color:${statusColor};padding:7px 11px;border-radius:20px;font-size:10px;font-weight:bold;">${statusLabel}</span>
        </td>
      </tr></table>
    </td></tr>`;
}

function emailFooter(brand = {}) {
  const supportEmail = brand.supportEmail || "info@gowildkarunadu.com";
  const supportPhone = brand.supportPhone || "+91 98765 43210";
  const brandName = brand.brandName || "goWILD Karunadu";
  return `
    <tr><td align="center" style="background:#f6f8f5;border-top:1px solid #e5eae5;padding:20px 25px;">
      <div style="font-size:11px;color:#68746b;">${supportEmail} &nbsp;•&nbsp; ${supportPhone}</div>
      <div style="font-size:10px;color:#98a199;margin-top:6px;">Support Hours: 9:00 AM – 6:00 PM (Mon–Sat)</div>
      <div style="font-size:10px;color:#a0a8a1;margin-top:12px;">© ${new Date().getFullYear()} ${brandName}. All rights reserved.</div>
    </td></tr>`;
}

function emailShell(innerRowsHtml) {
  return `
    <!doctype html>
    <html>
    <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    </head>
    <body style="margin:0;background:#f3f6f2;font-family:Arial,Helvetica,sans-serif;color:#26352b;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6f2;">
    <tr><td align="center" style="padding:25px 10px;">
    <table width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;background:#fff;border:1px solid #e1e7e1;border-radius:14px;overflow:hidden;">
    ${innerRowsHtml}
    </table>
    </td></tr>
    </table>
    </body>
    </html>`;
}

module.exports = {
  sendBookingConfirmation,
  sendCancellationEmail,
  sendPasswordResetEmail,
  sendOtpEmail,
};
