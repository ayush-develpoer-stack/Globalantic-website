export interface BlogPostSeed {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  categorySlug: string;
  tags: string[];
  readingTime: number;
}

// Educational, non-promotional articles with no fabricated statistics or claims.
export const blogPosts: BlogPostSeed[] = [
  {
    slug: 'how-to-choose-the-right-tech-stack',
    title: 'How to Choose the Right Tech Stack for Your Business Software',
    excerpt:
      'Choosing a technology stack is one of the most consequential early decisions for any software project. Here is a practical way to approach it.',
    content: `
## Start with the problem, not the technology

It is tempting to pick tools because they are popular. A better starting point is your actual requirements: who your users are, how many you expect, what integrations you need and how fast the product must evolve.

## Consider the whole lifecycle

A good stack is not just fast to build with — it should be maintainable, easy to hire for and stable over time. We generally favour well-supported, widely-adopted technologies because they have strong communities, documentation and long-term viability.

## Match the stack to the project

Different projects call for different tools. A content-heavy marketing site has different needs than a real-time dashboard or a mobile app. The right choice balances performance, developer productivity and long-term cost.

## Prioritise maintainability

The cheapest software to build is rarely the cheapest to own. Clean architecture, clear documentation and sensible conventions save far more time over a product's life than any shortcut taken at the start.

## In summary

Choose technology deliberately, based on your goals and constraints — not on trends. When in doubt, favour proven tools, clear architecture and long-term maintainability.
`,
    categorySlug: 'business-technology',
    tags: ['tech stack', 'software', 'architecture'],
    readingTime: 4,
  },
  {
    slug: 'why-website-performance-matters',
    title: 'Why Website Performance Matters More Than You Think',
    excerpt:
      'A fast website is not a nice-to-have — it shapes user experience, search visibility and conversions. Here is why performance deserves attention.',
    content: `
## Performance is user experience

When a page loads slowly, visitors notice. A fast, responsive site feels trustworthy and professional, while a slow one creates friction before a user even reads your content.

## Search engines reward speed

Search engines increasingly consider performance signals such as loading speed and stability. A well-optimised site is easier to find and can rank better for the same content.

## Small improvements compound

Optimising images, reducing unnecessary JavaScript, using server-side rendering and caching all add up. Individually they seem minor; together they transform the experience.

## Build performance in from the start

Performance is far easier to design in than to bolt on later. Choosing the right architecture, rendering strategy and hosting from the beginning avoids costly rework.

## In summary

Treat performance as a core feature, not an afterthought. It affects how users perceive you, how well you rank and how many visitors become customers.
`,
    categorySlug: 'web-development',
    tags: ['performance', 'web', 'seo'],
    readingTime: 4,
  },
];
