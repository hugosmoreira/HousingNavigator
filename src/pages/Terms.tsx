import {
  BookOpen,
  AlertTriangle,
  ExternalLink,
  ClipboardCheck,
  Scale,
} from 'lucide-react';

const LAST_UPDATED = 'May 2026';

export default function Terms() {
  return (
    <div className="bg-surface min-h-screen py-16">
      <div className="max-w-3xl mx-auto px-6 lg:px-12">
        <header className="mb-12">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-3">
            Terms
          </p>
          <h1 className="text-4xl lg:text-[2.75rem] font-headline font-bold text-on-surface mb-4 tracking-tight">
            Terms of service
          </h1>
          <p className="text-lg text-on-surface-variant font-body leading-relaxed">
            Plain-language terms for using Housing Navigator. By using the site
            you agree to the points below.
          </p>
          <p className="text-sm text-on-surface-variant mt-4">
            Last updated · {LAST_UPDATED}
          </p>
        </header>

        <Section
          icon={<BookOpen className="w-5 h-5" />}
          title="Informational use only"
        >
          <p>
            Housing Navigator is a community-maintained directory of housing
            resources and waitlists in the Portland and Vancouver metro area.
            Everything here is for general information.
          </p>
          <p>
            Nothing on the site is legal, medical, or financial advice. We do
            not provide housing, rental assistance, or shelter ourselves — we
            point you toward organizations that may.
          </p>
        </Section>

        <Section
          icon={<Scale className="w-5 h-5" />}
          title="Eligibility and openings"
        >
          <p>
            We do not decide who qualifies for any program, and we cannot
            guarantee an opening or funding will be available. Eligibility
            rules, intake hours, and availability are set by the listed
            organizations and change without notice.
          </p>
          <p>
            A program appearing on Housing Navigator is not a promise that you
            will be accepted, served, or housed.
          </p>
        </Section>

        <Section
          icon={<ClipboardCheck className="w-5 h-5" />}
          title="Verify before you act"
        >
          <p>
            Resource information is contributed and reviewed by volunteers and
            partner organizations. We label each entry with a "last verified"
            date so you can see how recently we checked it. Even so, the most
            up-to-date source is always the organization itself.
          </p>
          <p>
            Before traveling to an address, applying, or relying on a program,
            confirm hours, eligibility, and intake status directly with the
            agency.
          </p>
        </Section>

        <Section
          icon={<AlertTriangle className="w-5 h-5" />}
          title="Waitlist information"
        >
          <p>
            Waitlist openings, lottery windows, and pre-application periods are
            often short and shift quickly. We try to update the waitlist
            tracker promptly, but a status of "open" or "closed" here is a best
            effort, not an official source.
          </p>
          <p>
            Always cross-check the housing authority's own announcement before
            you apply.
          </p>
        </Section>

        <Section
          icon={<ExternalLink className="w-5 h-5" />}
          title="External links"
        >
          <p>
            The directory links to outside agencies, government sites, and
            nonprofit programs. We do not control those sites and are not
            responsible for their content, accuracy, or availability.
          </p>
          <p>
            Following an external link means you are leaving Housing Navigator
            and any further interaction is between you and that organization.
          </p>
        </Section>

        <Section
          icon={<Scale className="w-5 h-5" />}
          title="Limitation of liability"
        >
          <p>
            Housing Navigator and its maintainers cannot be held liable for any
            decision made based on information shown on the site. The directory
            is provided as-is, without warranty of any kind.
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
