# ChipIn — Organizer User Guide
**KafoTech · Version 1.0 · May 2026**

---

## Table of Contents
1. [What is ChipIn?](#1-what-is-chipin)
2. [Signing In](#2-signing-in)
3. [The Dashboard](#3-the-dashboard)
4. [Creating a Campaign](#4-creating-a-campaign)
5. [Campaign Types](#5-campaign-types)
6. [Managing a Campaign](#6-managing-a-campaign)
7. [Contributors](#7-contributors)
8. [WhatsApp Reminders](#8-whatsapp-reminders)
9. [The Public Campaign Page & QR Card](#9-the-public-campaign-page--qr-card)
10. [Beneficiary Profiles](#10-beneficiary-profiles)
11. [Organizations](#11-organizations)
12. [Linking a Campaign to an Organization](#12-linking-a-campaign-to-an-organization)
13. [Multi-Currency & Payouts](#13-multi-currency--payouts)
14. [Recurring Collections](#14-recurring-collections)
15. [Susu Groups](#15-susu-groups)
16. [Quick Reference: Role Permissions](#16-quick-reference-role-permissions)

---

## 1. What is ChipIn?

ChipIn is a group fundraising and collection platform built for diaspora communities. It is designed for the way community fundraising actually works in West African households and clubs:

- A group leader (organiser) creates a collection campaign and tracks who has paid.
- Contributors receive a WhatsApp reminder with a payment link.
- Money collected can be paid out directly to a mobile money wallet (Wave, MTN, Airtel) or bank account.

**Who is it for?**
- Sports clubs (dues, kit fund, match fees)
- Community associations (yearly contributions, welfare fund)
- Families & friend groups (wedding gifts, funeral repatriation, medical support)
- Religious groups (mosque/church building funds)

---

## 2. Signing In

ChipIn uses **magic links** — no password needed.

1. Go to the ChipIn URL your admin gave you.
2. Enter your email address and click **Send magic link**.
3. Open your email and click the link inside. You are signed in automatically.
4. The link expires after **15 minutes**. If it expires, just request a new one.

> **Dev/test environments:** If email is not configured, a yellow box appears on screen with a clickable link. Use that to sign in.

---

## 3. The Dashboard

After signing in you land on the **Campaigns** dashboard. This is your home screen.

| Element | What it does |
|---------|-------------|
| Campaign cards | Each card shows one of your campaigns — title, emoji, goal, amount raised, and status. |
| **+ New Campaign** | Opens the campaign creation wizard. |
| **Organizations** (top nav) | Go to your saved member groups. |
| **Recurring** (top nav) | Scheduled / repeating collections. |
| **Susu** (top nav) | Rotating savings groups. |
| **Payouts** (top nav) | Set up your mobile money or bank payout account. |
| **Sign out** | Log out of your session. |

Clicking any campaign card takes you to that campaign's management page.

---

## 4. Creating a Campaign

Click **+ New Campaign** on the dashboard. A 2- or 3-step wizard opens.

### Step 1 — Choose a Template (or start from scratch)

Templates pre-fill common settings for you:

| Template | Best for |
|----------|----------|
| ⚽ Sports Club | Match fees, kit fund, trip costs |
| 🕌 Community Fund | General welfare / association dues |
| 💒 Wedding Gift | Group gift for a couple |
| 🎓 Graduation | Graduation collection or gift |
| 🕊 Memorial / Funeral | Repatriation costs, bereavement |
| ❤️ Charity / Medical | Medical bills, hardship support |

You can always override any template value. Click **Start from scratch** to skip templates.

### Step 2 — Campaign Details

| Field | Required | Notes |
|-------|----------|-------|
| **Emoji** | Yes | Shown on the public page and cards |
| **Title** | Yes | Keep it clear, e.g. "Kemba's Funeral Repatriation Fund" |
| **Description** | No | Shown on the public page to contributors |
| **Campaign Type** | Yes | General / Memorial / Charity / Celebration |
| **Goal Amount** | Yes | Total you are trying to raise (in your collection currency) |
| **Per Person Amount** | No | If each member owes a fixed amount, enter it here. Auto-fills contributor records. |
| **Visibility on Public Board** | Yes | Full name / First name only / Anonymous |
| **Allow Anonymous Contributions** | Yes | Whether people who are not on your list can chip in |
| **Link to Organization** | No | Attach to a saved group so members are auto-imported (see §12) |

Click **Create Campaign** (or **Next: Beneficiary** for memorial/charity).

### Step 3 — Beneficiary Profile (memorial & charity only)

Add a name, photo, location, and story for the person the campaign supports. This appears on the public page and significantly increases trust and contributions. You can skip it and add it later.

---

## 5. Campaign Types

| Type | Description | Key behaviour |
|------|-------------|---------------|
| **General** | Sports, trips, group events | Standard |
| **Memorial** | Funeral, repatriation, bereavement | Beneficiary profile required/recommended; defaults to anonymous visibility |
| **Charity** | Medical, hardship, community welfare | Same as memorial |
| **Celebration** | Wedding, graduation, baby shower | Standard; contributors often prefer to stay anonymous |

---

## 6. Managing a Campaign

Click a campaign card to open its management page. You will see tabs:

### Overview Tab
- **Progress bar** — shows total raised vs goal.
- **Stats** — total contributors, paid count, unpaid count.
- **Send Funds panel** — initiate a payout once money is collected (see §13).

### Contributors Tab
- Full list of everyone on the campaign with their paid/unpaid status.
- Mark individual contributors as paid manually.
- Add new contributors one by one (name + phone number).
- Send individual reminders.

### Settings Tab
- Edit the campaign title, description, goal, visibility, status.
- Change status to **Paused** (stops reminders) or **Completed** / **Archived** (hides from dashboard).

---

## 7. Contributors

A **contributor** is anyone who owes money in a campaign. They may or may not have a ChipIn account.

### How contributors are added
1. **Auto-import from org** — if the campaign is linked to an organisation, all active members are imported when the campaign is created.
2. **Manual add** — type a name and phone number in the Contributors tab.
3. **CSV import** — bulk-add via a CSV file on the Organisation members page.
4. **Self-add** — anyone with the public link can contribute (if anonymous contributions are enabled).

### Marking someone as paid
In the Contributors tab, click the **Mark paid** button next to their name. This is a manual step — ChipIn does not automatically reconcile incoming payments in the current version.

### Removing a contributor
Deactivate them from the org member list (see §11). They remain on historical campaigns for record purposes.

---

## 8. WhatsApp Reminders

ChipIn can send WhatsApp messages to every **unpaid** contributor who has a phone number on file.

### Sending a blast reminder
On the Overview tab of a campaign, click **Remind All**. ChipIn queues up to 50 messages at once and sends them in the background. You will see a confirmation of how many were queued.

### What the message looks like
> *"Hi [Name], this is a reminder that you have an outstanding contribution of $25 for [Campaign Title]. Please follow this link to confirm your payment: [link]. Thank you!"*

### Requirements
- The contributor must have a phone number saved.
- Your ChipIn account must have the Meta WhatsApp API token configured (done by your admin in the server environment variables).

---

## 9. The Public Campaign Page & QR Card

Every campaign has a **public page** at:
```
http://[your-domain]/p/[campaign-slug]
```

This page shows:
- Campaign title, emoji, description
- Goal amount and progress bar
- The contributor leaderboard (respecting your visibility settings)
- A **Contribute** button / payment form

### QR Card
For in-person collections (at a meeting, event, or mosque), download a printable A5 QR card:

1. Open the campaign.
2. Go to **Settings** → **Download QR Card**.
3. Choose **PNG** (for WhatsApp/screen) or **PDF** (for printing).
4. The card shows the campaign name, emoji, and a QR code that takes contributors straight to the public page.

### Sharing the link
Copy the public link from the campaign detail page and paste it into your WhatsApp group, Facebook post, or email.

---

## 10. Beneficiary Profiles

A beneficiary profile humanises your campaign and is especially important for memorial and charity collections.

**What it contains:**
- Full name of the person being supported
- Photo
- Location (e.g. "Banjul, The Gambia")
- Story (up to 1,000 characters)

**Adding or editing a beneficiary:**
1. Open the campaign → click **Beneficiary** tab (or you are prompted after campaign creation).
2. Upload a photo, fill in the name and story, and save.
3. The profile appears immediately on the public campaign page.

Only one beneficiary profile is allowed per campaign. You can update it at any time.

---

## 11. Organizations

An **Organisation** is a saved list of members — your sports club, your community association, your workplace group. You create the org once, build the member list, and then reuse it every time you run a collection.

### Creating an organisation
1. Click **Organizations** in the top nav.
2. Click **+ New Organization**.
3. Fill in: name, type, optional description, optional WhatsApp group name.
4. You are set as the owner and an admin member automatically.

### Organisation types
Sports · Religious · Community · Professional · Social

### Adding members
**One by one:**
- Open the org → **Members** tab → **Add Member**.
- Enter name, phone number (international format, e.g. +2207123456), optional email, and role.

**By CSV import:**
- Prepare a CSV file with columns: `name`, `phone`, `email` (email is optional).
- Open the org → **Members** tab → **Import CSV**.
- Duplicates (matched by phone number) are skipped automatically.

### Member roles
| Role | Permissions |
|------|-------------|
| **Admin** | Manage members, create/manage campaigns for this org |
| **Treasurer** | Same as admin |
| **Member** | View only |

### Deactivating a member
When someone leaves the group, deactivate them (do not delete). Their payment history on past campaigns is preserved. Deactivated members are not auto-imported into new campaigns.

### Membership status diff
If your org and a campaign get out of sync, use the **Membership Status** view on the org campaigns tab. It shows you three lists:
- Contributors on the campaign who are **not** in the org roster (e.g. someone you added manually)
- Org members who are **not** yet on the campaign
- Deactivated members who are **still listed** as contributors

---

## 12. Linking a Campaign to an Organization

When you create a campaign, select your org in the **Link to Organization** dropdown.

**What happens automatically:**
- Every **active** org member is added as a contributor to the campaign.
- Each contributor's amount is set to the campaign's **Per Person** amount (if you set one).

**Later: syncing new members**
If you add new members to the org after the campaign is already created:
1. Open the campaign → **Contributors** tab.
2. Click **Sync Org Members**.
3. Any org members not yet on the campaign are shown — select the ones to add and confirm.

---

## 13. Multi-Currency & Payouts

ChipIn supports collecting in one currency (e.g. USD/GBP/EUR/CAD) and paying out in another (e.g. GMD, NGN, GHS, XOF).

### Setting currencies on a campaign
When creating or editing a campaign:
- **Collection Currency** — the currency contributors pay in (USD, GBP, EUR, CAD).
- **Payout Currency** — the currency you want to receive the funds in (USD, GBP, EUR, GMD, NGN, GHS, XOF).

The public campaign page will automatically show the converted goal and amount raised in the payout currency (e.g. "Goal: $600 USD (~GMD 42,000)") using live exchange rates.

### Setting up a payout method
Before you can receive funds:
1. Go to **Payouts** in the top nav.
2. Select your country.
3. Select your mobile money provider (e.g. Wave for Gambia/Senegal, MTN Mobile Money for Ghana/Nigeria).
4. Enter your phone number and verify it with the code sent via WhatsApp.
5. Your verified account is saved and ready to use.

**Supported providers:**
| Country | Provider |
|---------|---------|
| The Gambia | Wave |
| Senegal | Wave |
| Ghana | MTN Mobile Money |
| Nigeria | Flutterwave (bank/wallet) |
| Others | Manual (bank transfer arranged separately) |

### Sending funds
1. Open the campaign → **Overview** tab.
2. Scroll to the **Send Funds** panel.
3. Select your payout method.
4. Enter the amount to transfer (up to the total raised).
5. Click **Send Funds** and confirm.
6. You will receive a WhatsApp notification when the transfer is processed with a reference number.

### Viewing payout history
The **Send Funds** panel shows all past payouts for the campaign — amount, date, status (pending / processing / completed / failed), and reference number.

---

## 14. Recurring Collections

The **Recurring** section (top nav) lets you set up a campaign that repeats on a schedule — weekly, monthly, or annually. This is useful for:
- Monthly association dues
- Annual subscriptions
- Regular community contributions

Each recurring cycle creates a new campaign instance automatically, importing the same member list.

---

## 15. Susu Groups

**Susu** is a traditional West African rotating savings scheme. ChipIn's Susu module digitises it:

- A fixed number of members each contribute a fixed amount every cycle.
- The total pot is paid out to one member per cycle, rotating through the group.
- ChipIn tracks contributions, the current payout recipient, and the cycle history.

Access it via **Susu** in the top nav.

---

## 16. Quick Reference: Role Permissions

### Campaign access
| Action | Campaign Owner |
|--------|---------------|
| Create / edit / delete campaign | ✅ |
| Add / remove contributors | ✅ |
| Mark contributors as paid | ✅ |
| Send WhatsApp reminders | ✅ |
| Download QR card | ✅ |
| Initiate payout | ✅ |
| View public page | Everyone |

### Organisation access
| Action | Org Owner | Admin / Treasurer | Member |
|--------|-----------|-------------------|--------|
| Edit org settings | ✅ | ✅ | ❌ |
| Add / edit / deactivate members | ✅ | ✅ | ❌ |
| Import CSV | ✅ | ✅ | ❌ |
| Create campaigns for org | ✅ | ✅ | ❌ |
| View members & campaigns | ✅ | ✅ | ✅ |

---

## Appendix: Glossary

| Term | Meaning |
|------|---------|
| **Campaign** | A single fundraising or collection drive with a goal amount and list of contributors |
| **Contributor** | A person who owes money (or has paid) in a campaign |
| **Org / Organisation** | A saved group of people reused across multiple campaigns |
| **Beneficiary** | The person a memorial or charity campaign is raising money for |
| **Magic link** | A one-time sign-in link sent to your email — no password needed |
| **Payout method** | Your mobile money or bank account used to receive collected funds |
| **Susu** | A rotating savings group where each member receives the full pot on a cycle |
| **Collection currency** | The currency contributors pay in |
| **Payout currency** | The currency you receive the funds in (can differ from collection currency) |
| **QR card** | A printable or shareable card with a QR code linking to your public campaign page |
| **Reminder blast** | A WhatsApp message sent to all unpaid contributors at once |

---

*Built by KafoTech. For support, contact your administrator.*
