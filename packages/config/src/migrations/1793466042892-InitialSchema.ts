import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema (generated 2026-10-31 with `yarn migration:generate:ephemeral InitialSchema` from the
 * entities as of that date). Fresh databases get the whole schema from here.
 */

export class InitialSchema1793466042892 implements MigrationInterface {
    name = 'InitialSchema1793466042892'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Baseline for databases that predate migrations (schema created by `synchronize`): the tables exist
        // already, so only record this migration as applied. Later migrations handle the deltas.
        if (await queryRunner.hasTable('tenant')) {
            console.log('[migrations] InitialSchema: existing schema detected, recorded as baseline');
            return;
        }
        await queryRunner.query(`CREATE TABLE "tenant" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "isActive" boolean NOT NULL DEFAULT true, "isArchived" boolean NOT NULL DEFAULT false, "name" character varying NOT NULL, "logo" character varying, "externalTenantId" character varying, CONSTRAINT "PK_da8c6efd67bb301e810e56ac139" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_56211336b5ff35fd944f225917" ON "tenant"  ("name") `);
        await queryRunner.query(`CREATE INDEX "IDX_6ee509abafbc69913ea0bd747d" ON "tenant"  ("externalTenantId") `);
        await queryRunner.query(`CREATE TABLE "organization" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "isActive" boolean NOT NULL DEFAULT true, "isArchived" boolean NOT NULL DEFAULT false, "tenantId" uuid, "name" character varying NOT NULL, "externalOrgId" character varying, CONSTRAINT "PK_472c1f99a32def1b0abb219cd67" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_745a293c8b2c750bc421fa0633" ON "organization"  ("tenantId") `);
        await queryRunner.query(`CREATE INDEX "IDX_c21e615583a3ebbb0977452afb" ON "organization"  ("name") `);
        await queryRunner.query(`CREATE INDEX "IDX_223e8a721238f87ba1b7b862e6" ON "organization"  ("externalOrgId") `);
        await queryRunner.query(`CREATE TABLE "user" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "isActive" boolean NOT NULL DEFAULT true, "isArchived" boolean NOT NULL DEFAULT false, "tenantId" uuid, "firstName" character varying, "lastName" character varying, "email" character varying, "username" character varying, "hash" character varying, "externalUserId" character varying, "externalTenantId" character varying, CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_685bf353c85f23b6f848e4dcde" ON "user"  ("tenantId") `);
        await queryRunner.query(`CREATE INDEX "IDX_58e4dbff0e1a32a9bdc861bb29" ON "user"  ("firstName") `);
        await queryRunner.query(`CREATE INDEX "IDX_f0e1b4ecdca13b177e2e3a0613" ON "user"  ("lastName") `);
        await queryRunner.query(`CREATE INDEX "IDX_e12875dfb3b1d92d7d7c5377e2" ON "user"  ("email") `);
        await queryRunner.query(`CREATE INDEX "IDX_78a916df40e02a9deb1c4b75ed" ON "user"  ("username") `);
        await queryRunner.query(`CREATE INDEX "IDX_31410ff4db5cce62c13e1d3b5d" ON "user"  ("externalUserId") `);
        await queryRunner.query(`CREATE INDEX "IDX_96ce38d255e8ff9c9a899f7730" ON "user"  ("externalTenantId") `);
        await queryRunner.query(`CREATE TABLE "job_search_criterion" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "isActive" boolean NOT NULL DEFAULT true, "isArchived" boolean NOT NULL DEFAULT false, "tenantId" uuid, "orgId" uuid, "category" character varying, "categoryId" character varying, "occupation" character varying, "occupationId" character varying, "jobType" character varying, "keyword" character varying, "location" character varying, "country" character varying, "isRemote" boolean, "hoursOld" integer, "employeeId" uuid NOT NULL, CONSTRAINT "PK_e8d5b135d8b21d2a2af08c9563a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_cfcce3d9fdae00ee22b658ad53" ON "job_search_criterion"  ("tenantId") `);
        await queryRunner.query(`CREATE INDEX "IDX_fa9aaa06e059c922fb2f5d4a76" ON "job_search_criterion"  ("orgId") `);
        await queryRunner.query(`CREATE INDEX "IDX_cbf5e55a3e3c153989fca66699" ON "job_search_criterion"  ("category") `);
        await queryRunner.query(`CREATE INDEX "IDX_e02e2ce7334c289ad61fd5fbd5" ON "job_search_criterion"  ("categoryId") `);
        await queryRunner.query(`CREATE INDEX "IDX_d87156b5f90f68e77d4fc65a95" ON "job_search_criterion"  ("occupation") `);
        await queryRunner.query(`CREATE INDEX "IDX_eff979bf59359b156418803a92" ON "job_search_criterion"  ("occupationId") `);
        await queryRunner.query(`CREATE INDEX "IDX_3ee1c277ea09281b24af0144b4" ON "job_search_criterion"  ("jobType") `);
        await queryRunner.query(`CREATE INDEX "IDX_50d66118fc4ba603dfb3ad0cfd" ON "job_search_criterion"  ("keyword") `);
        await queryRunner.query(`CREATE INDEX "IDX_45b2c855e18f7434fce767cac1" ON "job_search_criterion"  ("location") `);
        await queryRunner.query(`CREATE INDEX "IDX_d7ded9f4b1b7d48fba0ea288dc" ON "job_search_criterion"  ("country") `);
        await queryRunner.query(`CREATE INDEX "IDX_b91e76b5c0246d680529b6574b" ON "job_search_criterion"  ("employeeId") `);
        await queryRunner.query(`CREATE TABLE "employee" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "isActive" boolean NOT NULL DEFAULT true, "isArchived" boolean NOT NULL DEFAULT false, "tenantId" uuid, "orgId" uuid, "externalTenantId" character varying, "externalOrgId" character varying, "externalEmployeeId" character varying, "firstName" character varying, "lastName" character varying, "linkedInId" character varying, "jobType" character varying, "bio" text, "skillsSummary" text, "preferredRate" numeric(10,2), "experienceSummary" text, "customFields" text DEFAULT '{}', "userId" uuid, CONSTRAINT "UQ_583005f07f4936f37a6892ea4db" UNIQUE ("tenantId", "orgId", "firstName", "lastName"), CONSTRAINT "REL_f4b0d329c4a3cf79ffe9d56504" UNIQUE ("userId"), CONSTRAINT "PK_3c2bc72f03fd5abbbc5ac169498" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_4b3303a6b7eb92d237a4379734" ON "employee"  ("tenantId") `);
        await queryRunner.query(`CREATE INDEX "IDX_7b4ebca4c4e65ba5fef83f7ecd" ON "employee"  ("orgId") `);
        await queryRunner.query(`CREATE INDEX "IDX_f27529119062f1456d13548bc5" ON "employee"  ("externalTenantId") `);
        await queryRunner.query(`CREATE INDEX "IDX_62905731cd4ba1456eb024381e" ON "employee"  ("externalOrgId") `);
        await queryRunner.query(`CREATE INDEX "IDX_ba50adf668245453c2db64996e" ON "employee"  ("externalEmployeeId") `);
        await queryRunner.query(`CREATE INDEX "IDX_b304fdea1e7004a4bbf106f97d" ON "employee"  ("firstName") `);
        await queryRunner.query(`CREATE INDEX "IDX_c7f3c521e99f5668d2af7e77ea" ON "employee"  ("lastName") `);
        await queryRunner.query(`CREATE INDEX "IDX_fe5c0eb4e8a48cb21a95f9295c" ON "employee"  ("linkedInId") `);
        await queryRunner.query(`CREATE INDEX "IDX_f4b0d329c4a3cf79ffe9d56504" ON "employee"  ("userId") `);
        await queryRunner.query(`CREATE TABLE "automation_task" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "isActive" boolean NOT NULL DEFAULT true, "isArchived" boolean NOT NULL DEFAULT false, "tenantId" uuid, "orgId" uuid, "externalTenantId" character varying, "externalOrgId" character varying, "isBroadcast" boolean NOT NULL DEFAULT false, "commandType" character varying NOT NULL, "command" character varying, "commandResult" character varying, "status" character varying NOT NULL, "executionTime" integer, "executedDate" TIMESTAMP, "employeeId" uuid, "executedByEmployeeId" uuid, CONSTRAINT "PK_5eb15cbde676a644dc4f14362bc" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_bd4a4959f9289dc2dd428acf1d" ON "automation_task"  ("tenantId") `);
        await queryRunner.query(`CREATE INDEX "IDX_a227e910a2815775a4867b4b5e" ON "automation_task"  ("orgId") `);
        await queryRunner.query(`CREATE INDEX "IDX_d7ad62b0e0c295d276b291c464" ON "automation_task"  ("externalTenantId") `);
        await queryRunner.query(`CREATE INDEX "IDX_32ae8e71ba84934b3d287de760" ON "automation_task"  ("externalOrgId") `);
        await queryRunner.query(`CREATE INDEX "IDX_0ee5a2912ca6a0f3a71f724b98" ON "automation_task"  ("isBroadcast") `);
        await queryRunner.query(`CREATE INDEX "IDX_25a0521746cf4b019620f6f7bc" ON "automation_task"  ("commandType") `);
        await queryRunner.query(`CREATE INDEX "IDX_88a89b26142633910ea60403d4" ON "automation_task"  ("employeeId") `);
        await queryRunner.query(`CREATE INDEX "IDX_78daedd204406882211452b933" ON "automation_task"  ("executedByEmployeeId") `);
        await queryRunner.query(`CREATE TABLE "job_post" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "isActive" boolean NOT NULL DEFAULT true, "isArchived" boolean NOT NULL DEFAULT false, "providerCode" character varying NOT NULL, "providerJobId" character varying, "title" character varying NOT NULL, "description" text DEFAULT '', "jobDateCreated" TIMESTAMP, "jobStatus" character varying, "jobType" character varying, "url" character varying, "budget" character varying, "duration" character varying, "workload" character varying, "skills" character varying, "contractToHire" boolean, "category" character varying, "subcategory" character varying, "country" character varying, "clientFeedback" character varying, "englishLevel" character varying, "languages" character varying, "clientReviewsCount" integer, "clientJobsPosted" integer, "clientPastHires" integer, "proposalsCount" integer, "interviewingCount" integer, "invitesSentCount" integer, "unansweredInvitesCount" integer, "clientPaymentVerificationStatus" boolean, "searchCategory" character varying, "searchCategoryId" character varying, "searchOccupation" character varying, "searchOccupationId" character varying, "searchJobType" character varying, "searchKeyword" character varying, "companyName" character varying, "companyUrl" character varying, "isRemote" boolean, "location" character varying, "compensationMin" double precision, "compensationMax" double precision, "compensationCurrency" character varying, "compensationInterval" character varying, "sourceUrl" character varying, "isExpired" boolean DEFAULT false, "expiryCheckedAt" TIMESTAMP, "companyIndustry" character varying, "companyLogo" character varying, "companyDescription" text, "companyNumEmployees" character varying, "bannerPhotoUrl" character varying, "jobLevel" character varying, "jobFunction" character varying, "department" character varying, "team" character varying, "atsType" character varying, "atsId" character varying, "employmentType" character varying, "experienceRange" character varying, "listingType" character varying, "companyRating" double precision, CONSTRAINT "UQ_70bd3badbe13b67b4b999a69c23" UNIQUE ("providerCode", "providerJobId"), CONSTRAINT "PK_a70f902a85e6de57340d153c813" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_9d0c5847a2d76aa0b5426b7b03" ON "job_post"  ("providerCode") `);
        await queryRunner.query(`CREATE INDEX "IDX_d7e7fb9081fed6d0d0856d7021" ON "job_post"  ("providerJobId") `);
        await queryRunner.query(`CREATE INDEX "IDX_53ef07611f026fdefb3ddd7a80" ON "job_post"  ("contractToHire") `);
        await queryRunner.query(`CREATE INDEX "IDX_fb895992bae8fd1befe085d371" ON "job_post"  ("searchCategory") `);
        await queryRunner.query(`CREATE INDEX "IDX_67a805bb3217f3be8e334fb6d3" ON "job_post"  ("searchCategoryId") `);
        await queryRunner.query(`CREATE INDEX "IDX_e67c34a930a236cc596a96cc8d" ON "job_post"  ("searchOccupation") `);
        await queryRunner.query(`CREATE INDEX "IDX_77fc9cc77075b7393c82682cb1" ON "job_post"  ("searchOccupationId") `);
        await queryRunner.query(`CREATE INDEX "IDX_4cb423c1a70eb6b3d7cc6a4cf9" ON "job_post"  ("searchJobType") `);
        await queryRunner.query(`CREATE INDEX "IDX_4b04594d984177d4040014886e" ON "job_post"  ("searchKeyword") `);
        await queryRunner.query(`CREATE INDEX "IDX_98bf3e0c70aa89dcdfb6a9f968" ON "job_post"  ("isExpired") `);
        await queryRunner.query(`CREATE INDEX "IDX_49eedc9b1626b25acb49a6ab64" ON "job_post"  ("jobLevel") `);
        await queryRunner.query(`CREATE TABLE "employee_job_post" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "isActive" boolean NOT NULL DEFAULT true, "isArchived" boolean NOT NULL DEFAULT false, "tenantId" uuid, "orgId" uuid, "jobDateCreated" TIMESTAMP, "jobStatus" character varying, "jobType" character varying, "providerCode" character varying NOT NULL, "providerJobId" character varying, "isApplied" boolean, "appliedStatus" character varying, "appliedDate" TIMESTAMP, "matchScore" numeric(5,2), "skillsEvidence" text, "riskFlags" text, "budgetFit" character varying, "recommendedAction" character varying, "explanation" text, "modelUsed" character varying, "scoredAt" TIMESTAMP, "employeeId" uuid NOT NULL, "jobPostId" uuid, CONSTRAINT "UQ_864564ea57e410fca1628686b7c" UNIQUE ("tenantId", "orgId", "employeeId", "jobPostId"), CONSTRAINT "PK_88c0ec0c3457e11274fabc17e57" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_726f33492dab42d04b544e5770" ON "employee_job_post"  ("tenantId") `);
        await queryRunner.query(`CREATE INDEX "IDX_c5bc77f890f05fac3c0ee8d168" ON "employee_job_post"  ("orgId") `);
        await queryRunner.query(`CREATE INDEX "IDX_b78bc19825fea2de81a0f0facd" ON "employee_job_post"  ("jobDateCreated") `);
        await queryRunner.query(`CREATE INDEX "IDX_fe7379dd255b5be91c87945a99" ON "employee_job_post"  ("jobStatus") `);
        await queryRunner.query(`CREATE INDEX "IDX_8b686ab524017802e3458dc0a8" ON "employee_job_post"  ("jobType") `);
        await queryRunner.query(`CREATE INDEX "IDX_0a60c39e4c3c2ae757630e6cf3" ON "employee_job_post"  ("providerCode") `);
        await queryRunner.query(`CREATE INDEX "IDX_b268086bed26628c25e1bc69f0" ON "employee_job_post"  ("providerJobId") `);
        await queryRunner.query(`CREATE INDEX "IDX_e689f7c024142b44c589c0a004" ON "employee_job_post"  ("isApplied") `);
        await queryRunner.query(`CREATE INDEX "IDX_fe09d0a32a32b770a9869d599a" ON "employee_job_post"  ("appliedStatus") `);
        await queryRunner.query(`CREATE INDEX "IDX_45de61f5137d9d7931ea58086b" ON "employee_job_post"  ("matchScore") `);
        await queryRunner.query(`CREATE INDEX "IDX_c15fb55d6dc8d7cc064cda25af" ON "employee_job_post"  ("employeeId") `);
        await queryRunner.query(`CREATE INDEX "IDX_524d15da5ffa77a6677ab5de41" ON "employee_job_post"  ("jobPostId") `);
        await queryRunner.query(`CREATE TABLE "employee_job_application" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "isActive" boolean NOT NULL DEFAULT true, "isArchived" boolean NOT NULL DEFAULT false, "tenantId" uuid, "orgId" uuid, "jobDateCreated" TIMESTAMP, "jobStatus" character varying, "jobType" character varying, "providerCode" character varying NOT NULL, "providerJobId" character varying, "providerJobApplicationId" character varying, "isViewedByClient" boolean, "appliedDate" TIMESTAMP, "appliedStatus" character varying, "proposal" character varying, "isProposalGeneratedByAI" boolean, "proposalTemplate" character varying, "qa" character varying, "attachments" character varying, "rate" integer, "terms" character varying, "employeeJobPostId" uuid NOT NULL, "employeeId" uuid NOT NULL, "jobPostId" uuid NOT NULL, CONSTRAINT "PK_f6b1d4a165b93cd2fe17b89eec0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_a8fc95728cd3756225c8ba422b" ON "employee_job_application"  ("tenantId") `);
        await queryRunner.query(`CREATE INDEX "IDX_6fddb6aa258f6ea66f618fb460" ON "employee_job_application"  ("orgId") `);
        await queryRunner.query(`CREATE INDEX "IDX_8a1f08ba3fad8788bd0f510038" ON "employee_job_application"  ("jobDateCreated") `);
        await queryRunner.query(`CREATE INDEX "IDX_31951f55ccb899f8bc591ac3ef" ON "employee_job_application"  ("jobStatus") `);
        await queryRunner.query(`CREATE INDEX "IDX_ea3b2ecdb1cb14cdcd16bd4e63" ON "employee_job_application"  ("jobType") `);
        await queryRunner.query(`CREATE INDEX "IDX_610f87cf71596b38f7a2199987" ON "employee_job_application"  ("providerCode") `);
        await queryRunner.query(`CREATE INDEX "IDX_2131631c8d722acf4ed1274244" ON "employee_job_application"  ("providerJobId") `);
        await queryRunner.query(`CREATE INDEX "IDX_8df40fed4dc4af450bbbc5156f" ON "employee_job_application"  ("providerJobApplicationId") `);
        await queryRunner.query(`CREATE INDEX "IDX_c3204a286bc9a4d5b2281a20bb" ON "employee_job_application"  ("isViewedByClient") `);
        await queryRunner.query(`CREATE INDEX "IDX_e58db69c5cf7b07f149b43b0b3" ON "employee_job_application"  ("appliedStatus") `);
        await queryRunner.query(`CREATE INDEX "IDX_3d56da9e6b7f9270cebdb782ce" ON "employee_job_application"  ("employeeJobPostId") `);
        await queryRunner.query(`CREATE INDEX "IDX_1691d729067520d25787de9751" ON "employee_job_application"  ("employeeId") `);
        await queryRunner.query(`CREATE INDEX "IDX_3353bb3688d51d719f93b944bc" ON "employee_job_application"  ("jobPostId") `);
        await queryRunner.query(`CREATE TABLE "tenant_api_key" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "isActive" boolean NOT NULL DEFAULT true, "isArchived" boolean NOT NULL DEFAULT false, "tenantId" uuid, "apiKey" character varying NOT NULL, "apiSecret" character varying NOT NULL, "openAiSecretKey" character varying, "openAiOrganizationId" character varying, CONSTRAINT "PK_83032288ad7173ddc31dc5a0c34" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_df44cc2b5ba1a4cc95850eea7c" ON "tenant_api_key"  ("tenantId") `);
        await queryRunner.query(`CREATE INDEX "IDX_f1880affabfde9452afd4c46c0" ON "tenant_api_key"  ("apiKey") `);
        await queryRunner.query(`CREATE INDEX "IDX_77bf63bebb8021a1ca054548b8" ON "tenant_api_key"  ("apiSecret") `);
        await queryRunner.query(`CREATE INDEX "IDX_d52e21a64f68e428fc6796de39" ON "tenant_api_key"  ("openAiSecretKey") `);
        await queryRunner.query(`CREATE INDEX "IDX_da6638f857da2bf09ee9e534db" ON "tenant_api_key"  ("openAiOrganizationId") `);
        await queryRunner.query(`CREATE TABLE "source_config" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "isActive" boolean NOT NULL DEFAULT true, "isArchived" boolean NOT NULL DEFAULT false, "tenantId" uuid, "orgId" uuid, "sourceCode" character varying NOT NULL, "externalTenantId" character varying, "externalOrgId" character varying, "sourceOrgId" character varying, "grantType" character varying, "clientId" character varying, "clientSecret" character varying, "accessToken" character varying, "refreshToken" character varying, "useProxy" boolean, "cacheTtlSeconds" integer, "resultsWanted" integer, CONSTRAINT "PK_0ea589ab71883a54de1582df6cf" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_66e00e64fc4672d500ce654d59" ON "source_config"  ("tenantId") `);
        await queryRunner.query(`CREATE INDEX "IDX_17b685b441571354f1142bdf3d" ON "source_config"  ("orgId") `);
        await queryRunner.query(`CREATE INDEX "IDX_1f8e9daa61236528957fb3ea39" ON "source_config"  ("sourceCode") `);
        await queryRunner.query(`CREATE INDEX "IDX_3efd338eabab416ed10d552eff" ON "source_config"  ("externalTenantId") `);
        await queryRunner.query(`CREATE INDEX "IDX_ddc32b0fb5c0e0609230e7f9d7" ON "source_config"  ("externalOrgId") `);
        await queryRunner.query(`CREATE INDEX "IDX_72de232fb47563655d363f33fd" ON "source_config"  ("sourceOrgId") `);
        await queryRunner.query(`ALTER TABLE "organization" ADD CONSTRAINT "FK_745a293c8b2c750bc421fa06332" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user" ADD CONSTRAINT "FK_685bf353c85f23b6f848e4dcded" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "job_search_criterion" ADD CONSTRAINT "FK_cfcce3d9fdae00ee22b658ad53a" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "job_search_criterion" ADD CONSTRAINT "FK_fa9aaa06e059c922fb2f5d4a766" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "job_search_criterion" ADD CONSTRAINT "FK_b91e76b5c0246d680529b6574b6" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "employee" ADD CONSTRAINT "FK_4b3303a6b7eb92d237a4379734e" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "employee" ADD CONSTRAINT "FK_7b4ebca4c4e65ba5fef83f7ecd6" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "employee" ADD CONSTRAINT "FK_f4b0d329c4a3cf79ffe9d565047" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "automation_task" ADD CONSTRAINT "FK_bd4a4959f9289dc2dd428acf1db" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "automation_task" ADD CONSTRAINT "FK_a227e910a2815775a4867b4b5e9" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "automation_task" ADD CONSTRAINT "FK_88a89b26142633910ea60403d47" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "automation_task" ADD CONSTRAINT "FK_78daedd204406882211452b9335" FOREIGN KEY ("executedByEmployeeId") REFERENCES "employee"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "employee_job_post" ADD CONSTRAINT "FK_726f33492dab42d04b544e57708" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "employee_job_post" ADD CONSTRAINT "FK_c5bc77f890f05fac3c0ee8d1682" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "employee_job_post" ADD CONSTRAINT "FK_c15fb55d6dc8d7cc064cda25af7" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "employee_job_post" ADD CONSTRAINT "FK_524d15da5ffa77a6677ab5de41e" FOREIGN KEY ("jobPostId") REFERENCES "job_post"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "employee_job_application" ADD CONSTRAINT "FK_a8fc95728cd3756225c8ba422bc" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "employee_job_application" ADD CONSTRAINT "FK_6fddb6aa258f6ea66f618fb4605" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "employee_job_application" ADD CONSTRAINT "FK_3d56da9e6b7f9270cebdb782cec" FOREIGN KEY ("employeeJobPostId") REFERENCES "employee_job_post"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "employee_job_application" ADD CONSTRAINT "FK_1691d729067520d25787de97519" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "employee_job_application" ADD CONSTRAINT "FK_3353bb3688d51d719f93b944bcb" FOREIGN KEY ("jobPostId") REFERENCES "job_post"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tenant_api_key" ADD CONSTRAINT "FK_df44cc2b5ba1a4cc95850eea7c2" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "source_config" ADD CONSTRAINT "FK_66e00e64fc4672d500ce654d592" FOREIGN KEY ("tenantId") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "source_config" ADD CONSTRAINT "FK_17b685b441571354f1142bdf3dc" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(): Promise<void> {
        // Not reversible: on a database that predates migrations `up()` only recorded itself
        // (baseline), and dropping the schema here would delete all of that tenant data. A fresh
        // database is simply dropped instead.
        throw new Error('InitialSchema cannot be reverted: it may be the baseline of a pre-existing schema. Drop the database instead.');
    }

}
