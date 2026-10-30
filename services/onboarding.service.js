// Tenant onboarding by invitation: the e-lease text, default house rules,
// invite tokens and the invitation email.

const crypto = require('crypto');
const logger = require('../utils/logger');
const templatedEmail = require('./email.service');

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

const frontendUrl = () => process.env.FRONTEND_URL || 'https://nyumbasync.co.ke';
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const inviteUrl = (rawToken) => `${frontendUrl()}/onboard/${rawToken}`;

const DEFAULT_RULES = [
  'Pay rent in full by the due date each month through NyumbaSync (M-Pesa) so every payment is recorded.',
  'Keep the unit and shared areas (stairs, corridors, compound) clean, and dispose of rubbish only in the places provided.',
  'Keep noise down between 10:00 pm and 6:00 am and respect your neighbours at all times.',
  'Do not sublet the unit or let anyone other than the listed occupants live there without the landlord\'s written consent.',
  'Report any damage, leak, or fault through the maintenance request feature as soon as you notice it.',
  'Do not make structural changes, paint, or fit permanent fixtures without written permission from the landlord.',
  'No illegal activity of any kind on the premises. Smoking and pets are not allowed unless the landlord agrees in writing.',
  'Allow the landlord or their agent access to inspect or repair the unit after at least 24 hours\' notice, except in an emergency.',
  'Park only in allocated spaces and keep entrances and fire exits clear.',
  'Utility bills not included in the rent (such as electricity and water) are the tenant\'s responsibility.',
];

const money = (n) => Number(n || 0).toLocaleString('en-KE');
const day = (d) => new Date(d).toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Nairobi' });
const floorName = (f) => (f === 0 ? 'Ground floor' : `Floor ${f}`);

/** Label like "Unit A4 · Floor 2" (or just "the property" for a single-unit property). */
function unitLabel(unit, floor) {
  if (!unit) return 'the property';
  return `Unit ${unit}${floor === undefined || floor === null ? '' : ` · ${floorName(floor)}`}`;
}

/**
 * The e-lease, as titled sections. Plain data so the web page can render it
 * and the signed copy can be stored on the lease.
 */
function buildAgreementSections({ landlordName, tenantName, propertyTitle, address, unit, floor, terms }) {
  const premises = unit
    ? `${unitLabel(unit, floor)} at ${propertyTitle}${address ? `, ${address}` : ''}`
    : `${propertyTitle}${address ? `, ${address}` : ''}`;
  return [
    { title: 'Parties', body: `This residential tenancy agreement is made between ${landlordName} ("the Landlord") and ${tenantName} ("the Tenant").` },
    { title: 'Premises', body: `The Landlord lets and the Tenant takes ${premises} ("the Premises") for residential use only.` },
    { title: 'Term', body: `The tenancy runs for ${terms.durationMonths} month${terms.durationMonths === 1 ? '' : 's'}, from ${day(terms.startDate)} to ${day(terms.endDate)}.` },
    { title: 'Rent', body: `The Tenant shall pay rent of KES ${money(terms.rentAmount)} per month, due on or before day ${terms.rentDueDate} of each month. Rent paid after the due date may attract a late fee of up to 5% of the monthly rent.` },
    { title: 'Security deposit', body: `The Tenant shall pay a refundable security deposit of KES ${money(terms.depositAmount)}. It is held against unpaid rent and damage beyond fair wear and tear and returned within 30 days of the Tenant vacating and handing back the Premises.` },
    { title: 'Termination', body: 'The Landlord must give the Tenant at least two (2) months\' written notice, and the Tenant must give the Landlord at least one (1) month\'s written notice, to end this tenancy.' },
    { title: 'Repairs and care of the Premises', body: 'The Tenant shall keep the Premises in good condition and report faults promptly. The Landlord is responsible for structural repairs and for the building\'s shared services.' },
    { title: 'House rules', body: 'The Tenant agrees to follow the house rules listed with this agreement. Breaking them may be treated as a breach of this agreement.' },
    { title: 'Governing law', body: 'This agreement is governed by the laws of Kenya.' },
  ];
}

/** New raw token plus the sha256 that gets stored. */
function newToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  return { raw, hash: sha256(raw) };
}

/** Seconds until another invitation email may be sent for this invite, or 0. */
function cooldownSeconds(invite, now = Date.now()) {
  if (!invite.lastSentAt) return 0;
  const left = new Date(invite.lastSentAt).getTime() + RESEND_COOLDOWN_MS - now;
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/** Email the invitation. Resolves true only if the provider accepted it. */
async function sendInviteEmail(invite, { landlordName, propertyTitle }, rawToken) {
  try {
    const result = await templatedEmail.sendEmail(
      invite.email,
      `${landlordName} invited you to rent ${unitLabel(invite.unit, invite.floor)} - NyumbaSync`,
      'tenant-invitation',
      {
        firstName: invite.firstName,
        landlordName,
        propertyTitle,
        unitLabel: unitLabel(invite.unit, invite.floor),
        rent: money(invite.terms.rentAmount),
        deposit: money(invite.terms.depositAmount),
        startsOn: day(invite.terms.startDate),
        expiresOn: day(invite.expiresAt),
        inviteUrl: inviteUrl(rawToken),
        appUrl: frontendUrl(),
        year: new Date().getFullYear(),
      }
    );
    return result === true || !!(result && result.success === true);
  } catch (err) {
    logger.error('Failed to send tenant invitation email:', err);
    return false;
  }
}

module.exports = {
  INVITE_TTL_MS,
  DEFAULT_RULES,
  sha256,
  inviteUrl,
  unitLabel,
  buildAgreementSections,
  newToken,
  cooldownSeconds,
  sendInviteEmail,
};
