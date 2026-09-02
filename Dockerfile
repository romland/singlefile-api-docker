FROM node:22-bullseye-slim

ARG TARGETARCH
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true

RUN apt-get update && \
  apt-get install ca-certificates curl git gnupg xvfb fonts-liberation fontconfig -y --no-install-recommends && \
  if [ "$TARGETARCH" = "arm64" ]; then \
    echo "📦 ARM64 detected: Installing native Chromium..." && \
    apt-get install chromium -y --no-install-recommends; \
  else \
    echo "📦 AMD64 detected: Installing official Google Chrome..." && \
    curl -fSsL https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor > /etc/apt/trusted.gpg.d/google-archive.gpg && \
    sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' && \
    apt-get update && \
    apt-get install google-chrome-stable -y --no-install-recommends; \
  fi && \
  fc-cache -f -v && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /opt/app

RUN npm install 'git+https://github.com/gildas-lormeau/single-file-cli.git#master' express puppeteer-real-browser
# ==============================================================================
# CRITICAL BUGFIX: REMOVE CHROMIUM '--single-process' FLAG
# ------------------------------------------------------------------------------
# Upstream single-file-cli forces Chromium into '--single-process' mode by default.
# On complex e-commerce sites (IKEA, Amazon, etc.), Web Workers & dynamic scripts 
# DEADLOCK the single renderer thread. This freezes the DevTools Protocol (CDP) 
# session, leading to unhandled top-level await crashes (exit code 13).
# DO NOT REMOVE THIS LINE!
# ==============================================================================
RUN sed -i '/--single-process/d' node_modules/single-file-cli/lib/browser.js

COPY webserver.js .
COPY extract-inject.js .