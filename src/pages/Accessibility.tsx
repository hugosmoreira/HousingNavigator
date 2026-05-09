import {
  Accessibility as AccessibilityIcon,
  Keyboard,
  Eye,
  Smartphone,
  AlertCircle,
  Sparkles,
  Mail,
} from 'lucide-react';

const LAST_UPDATED = 'May 2026';

interface Feature {
  icon: React.ReactNode;
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    icon: <Keyboard className="w-5 h-5" />,
    title: 'Keyboard navigation',
    body: 'Every interactive element — links, buttons, search, filters, the waitlist toggle — can be reached and used with the keyboard. Visible focus rings show you where you are on the page.',
  },
  {
    icon: <Eye className="w-5 h-5" />,
    title: 'Readable contrast and type',
    body: 'Body text and headings aim for WCAG 2.1 AA contrast against their background. Body copy is set in a comfortable size with relaxed line height to make scanning easier.',
  },
  {
    icon: <Smartphone className="w-5 h-5" />,
    title: 'Mobile and small-screen support',
    body: 'The directory, waitlist tracker, and support pages reflow for phones and tablets. Tap targets are sized to be reachable with one hand, and content does not require horizontal scrolling.',
  },
];

const ROADMAP: string[] = [
  'Skip-to-content link on every page',
  'Audited screen-reader pass on the directory and waitlist pages',
  'Reduced-motion variant for animated transitions',
  'Plain-language toggle on long-form content',
];

export default function Accessibility() {
  return (
    <div className="bg-surface min-h-screen py-16">
      <div className="max-w-5xl mx-auto px-6 lg:px-12">
        <header className="max-w-3xl mb-12">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-3">
            Accessibility
          </p>
          <h1 className="text-4xl lg:text-[2.75rem] font-headline font-bold text-on-surface mb-4 tracking-tight">
            Designed for everyone looking for housing
          </h1>
          <p className="text-lg text-on-surface-variant font-body leading-relaxed">
            People search for housing under stress, on whatever device is in
            front of them. Housing Navigator should work no matter who you are
            or how you read it.
          </p>
          <p className="text-sm text-on-surface-variant mt-4">
            Last updated · {LAST_UPDATED}
          </p>
        </header>

        {/* Commitment */}
        <section className="bg-surface-container-low rounded-3xl p-8 lg:p-10 mb-10">
          <div className="flex items-start gap-5">
            <span className="w-12 h-12 shrink-0 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <AccessibilityIcon className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-xl font-headline font-bold text-on-surface mb-3 tracking-tight">
                Our commitment
              </h2>
              <p className="text-on-surface-variant leading-relaxed">
                We aim to meet the Web Content Accessibility Guidelines (WCAG)
                2.1 Level AA across the public site. Accessibility is not a
                checkbox we tick once — it is a part of how we review every
                change we ship.
              </p>
            </div>
          </div>
        </section>

        {/* Current features */}
        <section className="mb-10">
          <h2 className="text-2xl font-headline font-bold text-on-surface mb-6 tracking-tight">
            What is in place today
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <article
                key={f.title}
                className="bg-surface-container-lowest border border-surface-container-highest rounded-2xl p-6"
              >
                <div className="w-10 h-10 rounded-xl bg-secondary-container/50 text-tertiary-dim flex items-center justify-center mb-4">
                  {f.icon}
                </div>
                <h3 className="text-base font-headline font-bold text-on-surface mb-2">
                  {f.title}
                </h3>
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  {f.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* Reporting */}
        <section className="bg-surface-container-lowest border border-surface-container-highest rounded-2xl p-8 lg:p-10 mb-10">
          <div className="flex items-start gap-4 mb-4">
            <span className="w-10 h-10 shrink-0 rounded-xl bg-tertiary-container/50 text-tertiary flex items-center justify-center">
              <AlertCircle className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-xl font-headline font-bold text-on-surface tracking-tight">
                Run into an accessibility problem?
              </h2>
              <p className="text-sm text-on-surface-variant mt-1">
                We want to hear about it.
              </p>
            </div>
          </div>
          <p className="text-on-surface-variant leading-relaxed mb-4">
            If something is hard to read, hard to reach, or unusable with your
            assistive technology, please reach out. Tell us what you were
            trying to do, what device or screen reader you were using, and
            what got in the way. We treat accessibility reports as
            high-priority bugs.
          </p>
          <a
            href="/mission"
            className="inline-flex items-center gap-2 rounded-full bg-primary text-on-primary font-semibold text-sm px-5 py-2.5 hover:bg-primary-dim transition-colors"
          >
            <Mail className="w-4 h-4" /> Contact the maintainers
          </a>
        </section>

        {/* Roadmap */}
        <section>
          <div className="flex items-center gap-3 mb-5">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-2xl font-headline font-bold text-on-surface tracking-tight">
              What we are working on next
            </h2>
          </div>
          <ul className="space-y-3">
            {ROADMAP.map((item) => (
              <li
                key={item}
                className="bg-surface-container-lowest border border-surface-container-highest rounded-xl px-5 py-4 text-on-surface-variant text-sm leading-relaxed"
              >
                {item}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
