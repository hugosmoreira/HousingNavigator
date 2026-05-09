import { Shield, Database, Cookie, KeyRound, Mail } from 'lucide-react';

const LAST_UPDATED = 'May 2026';

export default function Privacy() {
  return (
    <div className="bg-surface min-h-screen py-16">
      <div className="max-w-3xl mx-auto px-6 lg:px-12">
        <header className="mb-12">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-3">
            Privacy
          </p>
          <h1 className="text-4xl lg:text-[2.75rem] font-headline font-bold text-on-surface mb-4 tracking-tight">
            How we handle your information
          </h1>
          <p className="text-lg text-on-surface-variant font-body leading-relaxed">
            Housing Navigator is a public directory. We try to collect as little
            personal information as possible — and to be honest about what we do
            collect.
          </p>
          <p className="text-sm text-on-surface-variant mt-4">
            Last updated · {LAST_UPDATED}
          </p>
        </header>

        <Section icon={<Database className="w-5 h-5" />} title="What we collect">
          <p>
            Browsing the public directory does not require an account. We do not
            ask for your name, address, income, or household details to view
            resources or waitlists.
          </p>
          <p>
            If you contact us by email or submit a resource correction, we keep
            the message and any contact information you choose to share so we
            can reply and follow up.
          </p>
        </Section>

        <Section
          icon={<Cookie className="w-5 h-5" />}
          title="Analytics and cookies"
        >
          <p>
            We use a small amount of standard browser storage to remember UI
            choices (for example, which county you last filtered to) so the
            site feels less repetitive across visits. This information stays in
            your browser.
          </p>
          <p>
            We may use privacy-respecting analytics to understand which pages
            people read so we can improve the directory. Analytics, when used,
            are aggregate — we are not building a profile of you.
          </p>
        </Section>

        <Section
          icon={<KeyRound className="w-5 h-5" />}
          title="Admin authentication"
        >
          <p>
            Housing Navigator has a small admin area used by the volunteers who
            keep the directory up to date. Admin sign-in is handled by Supabase
            Auth. Only people listed in our admin allowlist can sign in, and
            only the admin area touches that authentication.
          </p>
          <p>
            If you are a regular visitor, you will never see the admin login —
            it is not part of the public directory experience.
          </p>
        </Section>

        <Section
          icon={<Shield className="w-5 h-5" />}
          title="Resource accuracy"
        >
          <p>
            The directory is maintained by volunteers and partner organizations.
            Information about programs, waitlists, eligibility, and openings
            changes frequently. We label each entry with a "last verified" date
            so you can see how fresh it is.
          </p>
          <p>
            Listing a program on Housing Navigator does not guarantee
            availability, eligibility, or funding. Always confirm directly with
            the agency before relying on a service.
          </p>
        </Section>

        <Section icon={<Mail className="w-5 h-5" />} title="Contact">
          <p>
            Questions about how we handle information, requests to remove your
            email from our records, or anything else — write to the
            project maintainers using the contact details on the{' '}
            <a className="text-primary font-semibold hover:underline" href="/mission">
              About
            </a>{' '}
            page.
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6 bg-surface-container-lowest border border-surface-container-highest rounded-2xl p-8 lg:p-10">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-9 h-9 rounded-xl bg-secondary-container/50 text-tertiary-dim flex items-center justify-center">
          {icon}
        </span>
        <h2 className="text-xl font-headline font-bold text-on-surface tracking-tight">
          {title}
        </h2>
      </div>
      <div className="space-y-4 text-on-surface-variant leading-relaxed">
        {children}
      </div>
    </section>
  );
}
