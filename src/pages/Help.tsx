import {
  Search,
  Tags,
  ListChecks,
  RefreshCw,
  CalendarCheck,
  HelpCircle,
  ChevronDown,
  BookOpen,
} from 'lucide-react';

interface Topic {
  icon: React.ReactNode;
  title: string;
  body: string;
}

interface Faq {
  question: string;
  answer: string;
}

interface GlossaryTerm {
  term: string;
  definition: string;
}

const TOPICS: Topic[] = [
  {
    icon: <Search className="w-5 h-5" />,
    title: 'How to search resources',
    body: 'Use the search box and category filters on the Find resources page. Start broad — by county or category — and narrow down. Every card shows a category tag, location, and how to apply.',
  },
  {
    icon: <Tags className="w-5 h-5" />,
    title: 'Understanding categories',
    body: 'Categories group resources by what they help with: rent assistance, eviction prevention, emergency shelter, legal aid, and more. A program may fit more than one need; pick the closest match to your situation.',
  },
  {
    icon: <ListChecks className="w-5 h-5" />,
    title: 'Waitlist information',
    body: 'The waitlist tracker shows whether a housing authority is currently accepting applications. Status changes quickly — always confirm directly with the authority before you apply.',
  },
  {
    icon: <RefreshCw className="w-5 h-5" />,
    title: 'How often information is updated',
    body: 'Volunteers and partner agencies review listings on a rolling basis. Most active listings are checked at least every few weeks; some change more often than we can keep up with.',
  },
  {
    icon: <CalendarCheck className="w-5 h-5" />,
    title: 'What "Last verified" means',
    body: 'The date shows when a human last confirmed the listing was accurate. If a "last verified" date is months old, treat the details as a starting point and call the agency to confirm.',
  },
  {
    icon: <HelpCircle className="w-5 h-5" />,
    title: 'Why some availability is unknown',
    body: 'Many programs do not publish real-time openings. When we cannot confirm a status, we mark it "Unknown" rather than guess. Reach out to the program directly to learn current availability.',
  },
];

const FAQS: Faq[] = [
  {
    question: 'Do I need an account to use Housing Navigator?',
    answer:
      'No. The directory and waitlist tracker are completely public — search, browse, and view everything without signing up. A free account is optional and only adds convenience: save resources for later, follow waitlists, and get an email alert when a waitlist you follow changes status.',
  },
  {
    question: 'Can you tell me if I qualify for a program?',
    answer:
      "We don't decide eligibility. The directory shows a plain-language summary of who each program is designed for, but the program itself makes the final call. When in doubt, apply or call them — many programs are more flexible than the summary suggests.",
  },
  {
    question: 'I found wrong or outdated information. How do I report it?',
    answer:
      'Note the listing name and what looks off. We review listings on a rolling basis, and a built-in "report an issue" button is on our roadmap. In the meantime, the fastest way to confirm current details is the official "Visit site" link on the listing itself.',
  },
  {
    question: 'Why is a program I know about not listed?',
    answer:
      'The directory grows as volunteers add and verify entries. If something is missing, let us know — we add new programs frequently.',
  },
  {
    question: 'Is Housing Navigator only for Portland and Vancouver?',
    answer:
      'For now, yes. Our focus is the Portland metro area and Vancouver, WA so we can keep the directory accurate. We may expand later if we have help maintaining other regions.',
  },
];

const GLOSSARY: GlossaryTerm[] = [
  {
    term: 'Rapid rehousing',
    definition:
      'Short-term rental assistance and case management designed to move someone out of homelessness and into stable housing as quickly as possible, usually within a few months.',
  },
  {
    term: 'Coordinated entry',
    definition:
      'A single intake process used by a region\'s homeless-services system to assess need and refer people to the most appropriate resource. In our area, coordinated entry is a common starting point.',
  },
  {
    term: 'Voucher',
    definition:
      'A subsidy (most often a Section 8 / Housing Choice Voucher) that pays part of the rent directly to a private landlord on behalf of an eligible household.',
  },
  {
    term: 'Transitional housing',
    definition:
      'Time-limited housing — usually six months to two years — combined with services that help residents move into permanent housing.',
  },
  {
    term: 'Shelter',
    definition:
      'A place to sleep tonight or for a short stay. Shelters vary widely: some are walk-in, some require a referral through coordinated entry, and many are gender- or family-specific.',
  },
];

export default function Help() {
  return (
    <div className="bg-surface min-h-screen py-16">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <header className="max-w-3xl mb-14">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-3">
            Help center
          </p>
          <h1 className="text-4xl lg:text-[2.75rem] font-headline font-bold text-on-surface mb-4 tracking-tight">
            Get the most out of Housing Navigator
          </h1>
          <p className="text-lg text-on-surface-variant font-body leading-relaxed">
            Short answers to the questions we hear most, plus a glossary of the
            terms you will run into when looking for housing help.
          </p>
        </header>

        {/* Topics */}
        <section className="mb-16">
          <h2 className="text-2xl font-headline font-bold text-on-surface mb-6 tracking-tight">
            Using the directory
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {TOPICS.map((topic) => (
              <article
                key={topic.title}
                className="bg-surface-container-lowest border border-surface-container-highest rounded-2xl p-8"
              >
                <div className="w-12 h-12 rounded-xl bg-secondary-container/50 text-tertiary-dim flex items-center justify-center mb-5">
                  {topic.icon}
                </div>
                <h3 className="text-lg font-headline font-bold text-on-surface mb-3">
                  {topic.title}
                </h3>
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  {topic.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-16">
          <h2 className="text-2xl font-headline font-bold text-on-surface mb-6 tracking-tight">
            Frequently asked
          </h2>
          <div className="bg-surface-container-low rounded-3xl divide-y divide-surface-container-highest overflow-hidden">
            {FAQS.map((faq) => (
              <FaqItem key={faq.question} faq={faq} />
            ))}
          </div>
        </section>

        {/* Glossary */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <BookOpen className="w-5 h-5 text-primary" />
            <h2 className="text-2xl font-headline font-bold text-on-surface tracking-tight">
              Common housing terms
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {GLOSSARY.map((g) => (
              <div
                key={g.term}
                className="bg-surface-container-lowest border border-surface-container-highest rounded-2xl p-6"
              >
                <dt className="text-base font-headline font-bold text-on-surface mb-2">
                  {g.term}
                </dt>
                <dd className="text-sm text-on-surface-variant leading-relaxed">
                  {g.definition}
                </dd>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function FaqItem({ faq }: { faq: Faq }) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none px-6 lg:px-8 py-5 flex items-center justify-between gap-6 hover:bg-surface-container-low/60 transition-colors">
        <span className="text-base font-headline font-semibold text-on-surface">
          {faq.question}
        </span>
        <ChevronDown className="w-5 h-5 text-on-surface-variant shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-6 lg:px-8 pb-6 -mt-1 text-sm text-on-surface-variant leading-relaxed">
        {faq.answer}
      </div>
    </details>
  );
}
