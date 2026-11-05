# Ever Gauzy AI Platform API

ARG NODE_OPTIONS
ARG NODE_ENV
ARG API_BASE_URL
ARG API_HOST
ARG API_PORT
ARG SENTRY_DSN
ARG SENTRY_HTTP_TRACING_ENABLED
ARG SENTRY_POSTGRES_TRACKING_ENABLED
ARG DB_URI
ARG DB_HOST
ARG DB_NAME
ARG DB_PORT
ARG DB_USER
ARG DB_PASS
ARG DB_TYPE
ARG DB_SSL_MODE
ARG DB_CA_CERT
ARG DEMO
ARG AWS_ACCESS_KEY_ID
ARG AWS_SECRET_ACCESS_KEY
ARG AWS_REGION
ARG AWS_S3_BUCKET
ARG WASABI_ACCESS_KEY_ID
ARG WASABI_SECRET_ACCESS_KEY
ARG WASABI_REGION
ARG WASABI_SERVICE_URL
ARG WASABI_S3_BUCKET
ARG EXPRESS_SESSION_SECRET
ARG JWT_SECRET
ARG JWT_REFRESH_TOKEN_SECRET
ARG REFRESH_TOKEN_EXPIRATION_TIME
ARG MAIL_FROM_ADDRESS
ARG MAIL_HOST
ARG MAIL_PORT
ARG MAIL_USERNAME
ARG MAIL_PASSWORD
ARG UPWORK_CALLBACK_URL
ARG FILE_PROVIDER
ARG UNLEASH_APP_NAME
ARG UNLEASH_API_URL
ARG UNLEASH_INSTANCE_ID
ARG UNLEASH_REFRESH_INTERVAL
ARG UNLEASH_METRICS_INTERVAL
ARG UNLEASH_API_KEY
ARG PM2_PUBLIC_KEY
ARG PM2_SECRET_KEY
ARG PM2_MACHINE_NAME
ARG OPENAI_API_KEY
ARG OPENAI_ORGANIZATION_ID
ARG OPENAI_MODEL
ARG OPENAI_API_KEY_CURRENT
ARG OPENAI_ORGANIZATION_ID_CURRENT
ARG OPENAI_MODEL_CURRENT
ARG IS_DISABLE_AUTH
ARG CLOUD_PROVIDER
ARG JITSU_SERVER_URL
ARG JITSU_SERVER_WRITE_KEY
ARG OTEL_ENABLED
ARG OTEL_EXPORTER_OTLP_HEADERS
ARG OTEL_EXPORTER_OTLP_TRACES_ENDPOINT

FROM node:26.12.1-alpine3.23 AS dependencies

LABEL maintainer="ever@ever.co"
LABEL org.opencontainers.image.source="https://github.com/ever-co/ever-gauzy-ai"

ENV CI=true

# We need to set to "development", because we are using "yarn install" below to setup
# devDependencies even for production builds!
ENV NODE_ENV=development

# Set Python interpreter for `node-gyp` to use
ENV PYTHON /usr/bin/python

RUN apk --update add bash && npm i -g npm@latest \
	&& apk add --no-cache --virtual build-dependencies bind-tools curl tar xz jq python3 python3-dev py3-configobj py3-pip py3-setuptools build-base \
	snappy libheif dos2unix gcc g++ snappy-dev git libgcc libstdc++ linux-headers autoconf automake make nasm vips-dev vips

# Verify installed versions
RUN node --version && npm --version && python3 --version

RUN npm install --quiet node-gyp@10.2.0 -g && npm install yarn -g --force
RUN mkdir /srv/gauzy-ai && chown -R node:node /srv/gauzy-ai

COPY wait .deploy/api/entrypoint.prod.sh .deploy/api/entrypoint.compose.sh /
RUN chmod +x /wait /entrypoint.prod.sh /entrypoint.compose.sh && dos2unix /entrypoint.prod.sh && dos2unix /entrypoint.compose.sh

USER node:node

WORKDIR /srv/gauzy-ai

COPY --chown=node:node package.json yarn.lock ./

RUN yarn install --network-timeout 1000000 --frozen-lockfile

FROM node:26.12.1-alpine3.23 AS development

USER node:node

WORKDIR /srv/gauzy-ai

COPY --chown=node:node --from=dependencies /wait /entrypoint.prod.sh /entrypoint.compose.sh /
COPY --chown=node:node --from=dependencies /srv/gauzy-ai .
COPY . .

FROM node:26.12.1-alpine3.23 AS build

WORKDIR /srv/gauzy-ai

RUN mkdir dist

# node:26 images no longer bundle Yarn (the dependencies stage installs it, but globals do not
# carry across stages). Install Yarn classic (matches yarn.lock) for `yarn build` below.
RUN npm install yarn -g --force

# Copy the node_modules from the dependencies stage
COPY --from=dependencies /srv/gauzy-ai/node_modules ./node_modules

COPY --chown=node:node --from=development /srv/gauzy-ai .

ENV CI=true

# We make NODE_ENV and other env vars passed as build argument to be available in this stage
ARG NODE_ENV
ARG DEMO
ARG NODE_OPTIONS

ENV NODE_OPTIONS=${NODE_OPTIONS:-"--max-old-space-size=4000"}
ENV NODE_ENV=${NODE_ENV}
ENV DEMO=${DEMO:-false}

ENV IS_DOCKER=true

RUN if [ "$NODE_ENV" = "production" ]; then \
	yarn build:prod; \
	else \
	yarn build; \
	fi

FROM node:26.12.1-alpine3.23 AS production

WORKDIR /srv/gauzy-ai

COPY --chown=node:node --from=dependencies /wait ./wait
COPY --chown=node:node --from=dependencies /entrypoint.prod.sh .
COPY --chown=node:node --from=dependencies /entrypoint.compose.sh .
COPY --chown=node:node --from=dependencies /srv/gauzy-ai/node_modules ./node_modules/
COPY --chown=node:node --from=build /srv/gauzy-ai/dist .

RUN npm install pm2@4.5.1 -g && \
	mkdir /import && chown node:node /import && \
	touch ormlogs.log && chown node:node ormlogs.log && chown node:node wait && \
	chmod +x wait && chown -R node:node ./

# node:26 images no longer bundle Yarn (node:20 did); install Yarn classic so this stage keeps it.
RUN npm install yarn -g --force

# Clean up
RUN yarn cache clean

USER node:node

ENV CI=true

ENV NODE_OPTIONS=${NODE_OPTIONS:-"--max-old-space-size=4000"}
ENV NODE_ENV=${NODE_ENV:-production}
ENV API_HOST=${API_HOST:-api}
ENV API_PORT=${API_PORT:-3005}
ENV API_BASE_URL=${API_BASE_URL:-http://localhost:3005}
ENV SENTRY_DSN=${SENTRY_DSN}
ENV SENTRY_HTTP_TRACING_ENABLED=${SENTRY_HTTP_TRACING_ENABLED:-false}
ENV SENTRY_POSTGRES_TRACKING_ENABLED=${SENTRY_POSTGRES_TRACKING_ENABLED:-false}
ENV DB_URI=${DB_URI}
ENV DB_HOST=${DB_HOST:-db}
ENV DB_NAME=${DB_NAME:-postgres}
ENV DB_PORT=${DB_PORT:-5432}
ENV DB_USER=${DB_USER}
ENV DB_PASS=${DB_PASS}
ENV DB_TYPE=${DB_TYPE:-sqlite}
ENV DB_SSL_MODE=${DB_SSL_MODE}
ENV DB_CA_CERT=${DB_CA_CERT}
ENV DEMO=${DEMO:-false}
ENV CLOUD_PROVIDER=${CLOUD_PROVIDER}
ENV AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
ENV AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
ENV AWS_REGION=${AWS_REGION}
ENV AWS_S3_BUCKET=${AWS_S3_BUCKET}
ENV WASABI_ACCESS_KEY_ID=${WASABI_ACCESS_KEY_ID}
ENV WASABI_SECRET_ACCESS_KEY=${WASABI_SECRET_ACCESS_KEY}
ENV WASABI_REGION=${WASABI_REGION}
ENV WASABI_SERVICE_URL=${WASABI_SERVICE_URL}
ENV WASABI_S3_BUCKET=${WASABI_S3_BUCKET}
ENV EXPRESS_SESSION_SECRET=${EXPRESS_SESSION_SECRET:-gauzy}
ENV JWT_SECRET=${JWT_SECRET:-secretKey}
ENV JWT_REFRESH_TOKEN_SECRET=${JWT_REFRESH_TOKEN_SECRET:-refreshSecretKey}
ENV REFRESH_TOKEN_EXPIRATION_TIME=${REFRESH_TOKEN_EXPIRATION_TIME:-86400}
ENV MAIL_FROM_ADDRESS=${MAIL_FROM_ADDRESS}
ENV MAIL_HOST=${MAIL_HOST}
ENV MAIL_PORT=${MAIL_PORT}
ENV MAIL_USERNAME=${MAIL_USERNAME}
ENV MAIL_PASSWORD=${MAIL_PASSWORD}
ENV UPWORK_CALLBACK_URL=${UPWORK_CALLBACK_URL}
ENV FILE_PROVIDER=${FILE_PROVIDER}
ENV UNLEASH_APP_NAME=${UNLEASH_APP_NAME}
ENV UNLEASH_API_URL=${UNLEASH_API_URL}
ENV UNLEASH_INSTANCE_ID=${UNLEASH_INSTANCE_ID}
ENV UNLEASH_REFRESH_INTERVAL=${UNLEASH_REFRESH_INTERVAL}
ENV UNLEASH_METRICS_INTERVAL=${UNLEASH_METRICS_INTERVAL}
ENV UNLEASH_API_KEY=${UNLEASH_API_KEY}
ENV PM2_PUBLIC_KEY=${PM2_PUBLIC_KEY}
ENV PM2_SECRET_KEY=${PM2_SECRET_KEY}
ENV PM2_MACHINE_NAME=${PM2_MACHINE_NAME}
ENV JITSU_SERVER_URL=${JITSU_SERVER_URL}
ENV JITSU_SERVER_WRITE_KEY=${JITSU_SERVER_WRITE_KEY}
ENV OPENAI_API_KEY=${OPENAI_API_KEY}
ENV OPENAI_ORGANIZATION_ID=${OPENAI_ORGANIZATION_ID}
ENV OPENAI_MODEL=${OPENAI_MODEL}
ENV OPENAI_API_KEY_CURRENT=${OPENAI_API_KEY_CURRENT}
ENV OPENAI_ORGANIZATION_ID_CURRENT=${OPENAI_ORGANIZATION_ID_CURRENT}
ENV OPENAI_MODEL_CURRENT=${OPENAI_MODEL_CURRENT}
ENV IS_DISABLE_AUTH=${IS_DISABLE_AUTH}
ENV OTEL_ENABLED=${OTEL_ENABLED}
ENV OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=${OTEL_EXPORTER_OTLP_TRACES_ENDPOINT}
ENV OTEL_EXPORTER_OTLP_HEADERS=${OTEL_EXPORTER_OTLP_HEADERS}

EXPOSE ${API_PORT}

ENTRYPOINT [ "./entrypoint.prod.sh" ]

CMD [ "node", "main.js" ]
