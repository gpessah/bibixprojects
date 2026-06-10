import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // ---- Admin user ----
  const email = process.env.ADMIN_EMAIL ?? 'admin@example.com';
  const password = process.env.ADMIN_PASSWORD ?? 'changeme';
  const existingAdmin = await prisma.adminUser.findFirst();
  if (!existingAdmin) {
    await prisma.adminUser.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
        name: 'Admin',
      },
    });
    console.log(`Created admin user: ${email} / ${password}`);
  }

  // ---- Branding ----
  await prisma.branding.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  // ---- Welcome ----
  await prisma.welcome.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      title: 'Welcome to the team',
      message:
        "We're thrilled you're here. This hub is your home base for your first 90 days — explore each section, check off your tasks, and meet the people you'll work with.",
      videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      ctaLabel: 'Start your first week',
      ctaUrl: '/section/first-week',
    },
  });

  // ---- Sections ----
  const sections = [
    {
      key: 'welcome',
      title: 'Welcome',
      icon: 'Heart',
      order: 0,
      items: [
        { title: 'Company Mission', body: 'Why we exist and where we are going.' },
        { title: 'Leadership Message', body: 'A note from our CEO.' },
        { title: 'How We Win', body: 'Our strategy in one page.' },
      ],
    },
    {
      key: 'first-week',
      title: 'First Week',
      icon: 'Rocket',
      order: 1,
      items: [
        { title: 'Accounts Setup', body: 'Get your laptop, email, and SSO ready.' },
        { title: 'Meet Your Team', body: '1:1s with your manager and peers.' },
        { title: 'Compliance Basics', body: 'Mandatory training to complete by Friday.' },
      ],
    },
    {
      key: 'products',
      title: 'Product & Platform',
      icon: 'LayoutGrid',
      order: 2,
      items: [
        { title: 'Casino Platform', body: 'Our flagship product overview.' },
        { title: 'Sportsbook', body: 'How sportsbook works end-to-end.' },
        { title: 'Payments & CRM', body: 'Wallet, KYC, and CRM integrations.' },
      ],
    },
    {
      key: 'engineering',
      title: 'Engineering',
      icon: 'Code2',
      order: 3,
      items: [
        { title: 'Architecture', body: 'Services, data flow, and tech stack.' },
        { title: 'Dev Workflow', body: 'Branching, code review, and release.' },
        { title: 'CI/CD & Monitoring', body: 'How we ship and observe.' },
      ],
    },
    {
      key: 'compliance',
      title: 'Compliance & Security',
      icon: 'ShieldCheck',
      order: 4,
      items: [
        { title: 'Responsible Gaming', body: 'Player protection standards.' },
        { title: 'KYC / AML', body: 'Identity and anti-money-laundering.' },
        { title: 'Security Policies', body: 'Acceptable use, data handling, access.' },
      ],
    },
    {
      key: 'people',
      title: 'People & Culture',
      icon: 'Globe',
      order: 5,
      items: [
        { title: 'Values', body: 'How we behave with each other.', linkUrl: '/section/values' },
        { title: 'Meet the team', body: 'Faces and roles.', linkUrl: '/section/team' },
        { title: 'Growth & Feedback', body: 'Reviews, career frameworks, learning budgets.' },
      ],
    },
  ];

  for (const s of sections) {
    await prisma.section.upsert({
      where: { key: s.key },
      update: { title: s.title, icon: s.icon, order: s.order },
      create: {
        key: s.key,
        title: s.title,
        icon: s.icon,
        order: s.order,
        items: { create: s.items.map((it, i) => ({ ...it, order: i })) },
      },
    });
  }

  // ---- Plan milestones ----
  if ((await prisma.planMilestone.count()) === 0) {
    await prisma.planMilestone.create({
      data: {
        title: 'Week 1 — Land',
        description: 'Get set up and meet everyone.',
        dayRange: 'Day 1-7',
        order: 0,
        tasks: {
          create: [
            { title: 'Laptop & accounts ready', required: true, order: 0 },
            { title: 'Read company mission', required: true, order: 1 },
            { title: '1:1 with manager', required: true, order: 2 },
            { title: 'Meet your team', order: 3 },
            { title: 'Complete compliance training', required: true, order: 4 },
            { title: 'Set up dev environment', order: 5 },
            { title: 'Read engineering handbook', order: 6 },
          ],
        },
      },
    });
    await prisma.planMilestone.create({
      data: {
        title: '30 Days — Ramp',
        description: 'Get context, ship something small.',
        dayRange: 'Day 8-30',
        order: 1,
        tasks: {
          create: [
            { title: 'Shadow a teammate on a project', order: 0 },
            { title: 'Ship first PR', required: true, order: 1 },
            { title: 'Present what you learned', order: 2 },
          ],
        },
      },
    });
    await prisma.planMilestone.create({
      data: {
        title: '60 Days — Own',
        description: 'Take ownership of a workstream.',
        dayRange: 'Day 31-60',
        order: 2,
        tasks: {
          create: [
            { title: 'Lead a project end-to-end', order: 0 },
            { title: 'Mid-point review with manager', required: true, order: 1 },
          ],
        },
      },
    });
    await prisma.planMilestone.create({
      data: {
        title: '90 Days — Contribute',
        description: 'Make your mark.',
        dayRange: 'Day 61-90',
        order: 3,
        tasks: {
          create: [
            { title: 'Propose an improvement', order: 0 },
            { title: '90-day review', required: true, order: 1 },
          ],
        },
      },
    });
  }

  // ---- Products ----
  if ((await prisma.product.count()) === 0) {
    await prisma.product.createMany({
      data: [
        {
          name: 'Casino Platform',
          description: 'Real-money casino with 3,000+ games and live dealers.',
          linkUrl: 'https://example.com/casino',
          chartLabel: 'Monthly active players (k)',
          chartData: JSON.stringify([
            { label: 'Jan', value: 120 },
            { label: 'Feb', value: 132 },
            { label: 'Mar', value: 145 },
            { label: 'Apr', value: 160 },
            { label: 'May', value: 178 },
            { label: 'Jun', value: 195 },
          ]),
          order: 0,
        },
        {
          name: 'Sportsbook',
          description: 'Pre-match and live betting across 30+ sports.',
          linkUrl: 'https://example.com/sports',
          chartLabel: 'Bets placed per week (k)',
          chartData: JSON.stringify([
            { label: 'W1', value: 42 },
            { label: 'W2', value: 51 },
            { label: 'W3', value: 48 },
            { label: 'W4', value: 67 },
            { label: 'W5', value: 73 },
            { label: 'W6', value: 81 },
          ]),
          order: 1,
        },
        {
          name: 'Payments & CRM',
          description: 'Wallet, KYC, loyalty, and CRM all in one stack.',
          linkUrl: 'https://example.com/payments',
          chartLabel: 'Successful deposits (%)',
          chartData: JSON.stringify([
            { label: 'Jan', value: 92 },
            { label: 'Feb', value: 93 },
            { label: 'Mar', value: 95 },
            { label: 'Apr', value: 96 },
            { label: 'May', value: 97 },
            { label: 'Jun', value: 97 },
          ]),
          order: 2,
        },
      ],
    });
  }

  // ---- Team ----
  if ((await prisma.teamMember.count()) === 0) {
    await prisma.teamMember.createMany({
      data: [
        {
          name: 'Alex Morgan',
          role: 'CEO',
          photoUrl: 'https://i.pravatar.cc/300?img=12',
          bio: 'Building the future of gaming.',
          order: 0,
        },
        {
          name: 'Priya Shah',
          role: 'VP Engineering',
          photoUrl: 'https://i.pravatar.cc/300?img=47',
          bio: 'Loves distributed systems and good coffee.',
          order: 1,
        },
        {
          name: 'Lucas Silva',
          role: 'Head of Product',
          photoUrl: 'https://i.pravatar.cc/300?img=33',
          bio: 'Obsessed with the player experience.',
          order: 2,
        },
        {
          name: 'Maya Chen',
          role: 'People Lead',
          photoUrl: 'https://i.pravatar.cc/300?img=5',
          bio: 'Here to make your first 90 days great.',
          order: 3,
        },
      ],
    });
  }

  // ---- Values ----
  if ((await prisma.value.count()) === 0) {
    await prisma.value.createMany({
      data: [
        { title: 'Player First', description: 'Decisions start with the player experience.', icon: 'Heart', order: 0 },
        { title: 'Ship to Learn', description: 'Small bets, fast feedback, real data.', icon: 'Rocket', order: 1 },
        { title: 'Own It', description: 'See it, say it, fix it.', icon: 'ShieldCheck', order: 2 },
        { title: 'Better Together', description: 'Strong opinions, loosely held. Always kind.', icon: 'Users', order: 3 },
      ],
    });
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
