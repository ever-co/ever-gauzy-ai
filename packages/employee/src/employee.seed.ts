import { DataSource } from 'typeorm';
import { Employee } from '@packages/entities';

/**
 * Seed employees with diverse profiles for testing.
 * Each employee has a unique name, bio, skills, and background.
 */
export const createEmployees = async (
  connection: DataSource,
): Promise<Employee[]> => {
  const employees: Employee[] = [
    Object.assign(new Employee(), {
      firstName: 'Ruslan',
      lastName: 'Konviser',
      bio: 'CTO and software architect with 15+ years experience in distributed systems, DevOps, and enterprise architecture.',
      skillsSummary: 'Architecture, DevOps, Kubernetes, AWS, NestJS, Angular, PostgreSQL, MongoDB',
      experienceSummary: 'Led engineering teams at multiple startups. Built scalable microservices platforms serving millions of users.',
      preferredRate: 150,
      isActive: false,
    }),
    Object.assign(new Employee(), {
      firstName: 'Yavor',
      lastName: 'Grancharov',
      bio: 'Senior frontend developer specializing in Angular and TypeScript with a focus on enterprise applications.',
      skillsSummary: 'Angular, TypeScript, RxJS, NgRx, SCSS, Cypress, Jest',
      experienceSummary: '8 years building enterprise Angular applications for fintech and HR platforms.',
      preferredRate: 85,
      isActive: false,
    }),
    Object.assign(new Employee(), {
      firstName: 'Rahul',
      lastName: 'Rathor',
      bio: 'Full-stack Java/Spring developer with expertise in backend systems, REST APIs, and cloud infrastructure.',
      skillsSummary: 'Java, Spring Boot, Hibernate, PostgreSQL, Docker, AWS, Kafka',
      experienceSummary: '10 years in backend engineering. Built payment processing systems handling $1B+ annually.',
      preferredRate: 95,
      isActive: false,
    }),
    Object.assign(new Employee(), {
      firstName: 'Hristo',
      lastName: 'Hristov',
      bio: 'Go and systems engineer focusing on microservices, distributed systems, and high-performance APIs.',
      skillsSummary: 'Go, gRPC, Kubernetes, Terraform, Docker, PostgreSQL, Redis',
      experienceSummary: '6 years building Go microservices for logistics and IoT platforms.',
      preferredRate: 90,
      isActive: false,
    }),
    Object.assign(new Employee(), {
      firstName: 'Yordan',
      lastName: 'Genovski',
      bio: 'UX/UI designer and frontend developer passionate about creating beautiful, accessible interfaces.',
      skillsSummary: 'Figma, Sketch, React, CSS, Design Systems, Accessibility, User Research',
      experienceSummary: '7 years in product design for SaaS companies. Led design systems at two startups.',
      preferredRate: 75,
      isActive: false,
    }),
    Object.assign(new Employee(), {
      firstName: 'Alish',
      lastName: 'Meklyov',
      bio: 'Mobile developer specializing in cross-platform frameworks and native iOS/Android development.',
      skillsSummary: 'Angular, Ionic, React Native, Swift, Kotlin, Firebase',
      experienceSummary: '5 years shipping mobile apps. Published 10+ apps with 1M+ combined downloads.',
      preferredRate: 80,
      isActive: false,
    }),
    Object.assign(new Employee(), {
      firstName: 'Sarah',
      lastName: 'Chen',
      bio: 'Full-stack engineer with deep React and Node.js experience, focused on modern web applications.',
      skillsSummary: 'React, Next.js, Node.js, TypeScript, GraphQL, PostgreSQL, AWS',
      experienceSummary: '9 years building SaaS products. Technical lead at a Y Combinator startup.',
      preferredRate: 120,
      isActive: false,
    }),
    Object.assign(new Employee(), {
      firstName: 'Marcus',
      lastName: 'Weber',
      bio: 'Data scientist and ML engineer working on NLP, recommendation systems, and production ML pipelines.',
      skillsSummary: 'Python, PyTorch, TensorFlow, scikit-learn, Spark, SQL, Docker, Airflow',
      experienceSummary: '7 years in data science. Built recommendation engines serving 50M+ users at an e-commerce company.',
      preferredRate: 130,
      isActive: false,
    }),
    Object.assign(new Employee(), {
      firstName: 'Priya',
      lastName: 'Patel',
      bio: 'QA engineer and test automation specialist with expertise in CI/CD pipelines and quality processes.',
      skillsSummary: 'Selenium, Cypress, Playwright, Jest, Jenkins, GitHub Actions, API Testing',
      experienceSummary: '6 years in QA automation. Established QA processes at 3 startups from scratch.',
      preferredRate: 65,
      isActive: true,
    }),
    Object.assign(new Employee(), {
      firstName: 'James',
      lastName: 'Wilson',
      bio: 'Technical product manager bridging engineering and business, specializing in B2B SaaS products.',
      skillsSummary: 'Product Strategy, Agile, Scrum, Jira, Data Analysis, SQL, Stakeholder Management',
      experienceSummary: '10 years in product management. Launched 5 B2B products generating $10M+ ARR.',
      preferredRate: 140,
      isActive: false,
    }),
  ];

  return await insertEmployees(connection, employees);
};

const insertEmployees = async (
  connection: DataSource,
  employees: Employee[],
) => {
  const repo = connection.getRepository(Employee);

  await Promise.all(
    employees.map(async (emp) => {
      const existed = await repo.findOne({
        where: {
          firstName: emp.firstName,
          lastName: emp.lastName,
        },
      });

      if (existed) {
        emp.id = existed.id;
      }
    }),
  );

  return await repo.save(employees);
};
