FROM node:slim

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true

RUN apt-get update && apt-get install git gnupg wget python3 python3-pip python3-setuptools python3-venv -y && \
  wget --quiet --output-document=- https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor > /etc/apt/trusted.gpg.d/google-archive.gpg && \
  sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' && \
  apt-get update && \
  apt-get install google-chrome-stable -y --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /opt/app

RUN npm install 'gildas-lormeau/SingleFile#master'

COPY requirements.txt .
COPY webserver.py .

RUN pip3 install \
    --break-system-packages \
    --no-cache-dir \
    --no-warn-script-location \
    --user \
    -r requirements.txt
