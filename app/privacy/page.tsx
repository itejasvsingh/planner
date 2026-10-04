import type { Metadata } from 'next';
import type { CSSProperties, ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Privacy Policy · Align',
  description: 'What Align collects, how it is used, and how to remove it.',
};

const CONTACT = 'tejasvsingh001@gmail.com';
const UPDATED = '3 October 2026';

const page: CSSProperties = { maxWidth: 720, margin: '0 auto', padding: '40px 20px 80px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', lineHeight: 1.6, color: '#1d1d24', background: '#ffffff' };
const h2: CSSProperties = { fontSize: 20, marginTop: 36, marginBottom: 8 };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 style={h2}>{title}</h2>
      {children}
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main style={page}>
      <h1 style={{ fontSize: 30, marginBottom: 4 }}>Align Privacy Policy</h1>
      <p style={{ color: '#5e5f66', marginTop: 0 }}>Last updated {UPDATED}</p>

      <p>
        Align is a personal planner and money tracker (the app, the website at alignplanner.vercel.app and the Align
        WhatsApp bot). This policy explains what Align collects, how it is used, and how you can remove it. Contact:{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>

      <Section title="What Align collects">
        <ul>
          <li><b>Your WhatsApp number</b>, to sign you in (with a one-time code sent on WhatsApp) and to keep your data together.</li>
          <li><b>Your Google name and email</b>, if you sign in with Google.</li>
          <li><b>What you add</b>: tasks, goals, expenses, income, budgets, categories and settings.</li>
          <li><b>Messages you send the Align WhatsApp bot</b>, including voice notes and receipt photos, so it can add or answer things for you.</li>
          <li><b>Bank SMS</b>, only if you turn on SMS Auto-Import: bank and card transaction messages, from which Align records the amount, date, merchant and reference.</li>
          <li><b>Bank emails</b>, only if you connect Gmail or install Align&apos;s Gmail script: see the Gmail section below.</li>
          <li><b>Statement files</b> you upload are read to find transactions and are not stored. Only the transactions you choose to import are saved.</li>
        </ul>
      </Section>

      <Section title="Gmail and other Google user data">
        <p>If you choose to connect Gmail, Align asks Google for read-only access (it cannot send, change or delete email). Google describes this permission as viewing your email, because Gmail has no narrower option. Align itself:</p>
        <ul>
          <li>only opens emails from bank and card senders (transaction alerts and statements);</li>
          <li>extracts transaction details (amount, date, merchant, reference, account type) and saves those as transactions in your Align account;</li>
          <li>from card statements and alerts, keeps only the numbers needed to show your cards and accounts: a card&apos;s statement total, minimum due, due date and last four digits, payments made to it, and the latest available balance an account alert quotes;</li>
          <li>if you save a bank&apos;s statement password, opens that bank&apos;s statement PDFs from Gmail to read their transactions and closing balance; the PDFs are not stored, and the password is stored encrypted and never shown again (remove it any time in Settings → Gmail);</li>
          <li>does not store the emails themselves, and stores your Gmail access key encrypted;</li>
          <li>never sells this data, never uses it for advertising, never uses it to train AI models, and never sends it to AI services;</li>
          <li>does not let people read it, except with your permission for support, for security investigations, or where the law requires.</li>
        </ul>
        <p>
          Align&apos;s use and transfer of information received from Google APIs to any other app will adhere to the{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements.
        </p>
        <p>
          You can disconnect at any time in Align (Settings → Gmail → Disconnect) or at{' '}
          <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>. Disconnecting deletes the stored access key.
          Transactions already added stay in your account until you delete them.
        </p>
      </Section>

      <Section title="How it is used">
        <ul>
          <li>To run Align&apos;s features: your timeline, reminders, budgets, analysis and the WhatsApp bot.</li>
          <li>WhatsApp messages and bank SMS that Align&apos;s own rules can&apos;t read may be processed by Google&apos;s Gemini AI to understand them. Emails and Gmail data are never sent to AI.</li>
          <li>Align does not sell your data or show ads.</li>
        </ul>
      </Section>

      <Section title="Where it is stored and who processes it">
        <p>
          Data is stored in Google Firebase (Google Cloud) and the service runs on Vercel. WhatsApp messages pass through
          Meta&apos;s WhatsApp Business Platform. These providers process data only to run Align. Database access is limited to
          your signed-in account; Align&apos;s server has admin access to run features like the WhatsApp bot and imports.
        </p>
      </Section>

      <Section title="Keeping and deleting your data">
        <p>
          Your data is kept until you delete it. You can delete items in the app, turn off SMS or email import in Settings,
          and disconnect Gmail. To delete your whole account and everything in it, email{' '}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a> from the Google account or WhatsApp number you use with Align.
        </p>
      </Section>

      <Section title="Children">
        <p>Align is not meant for children under 13 and does not knowingly collect their data.</p>
      </Section>

      <Section title="Changes">
        <p>If this policy changes, the date above will change. Significant changes will be announced in the app.</p>
      </Section>
    </main>
  );
}
