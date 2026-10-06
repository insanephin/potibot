FROM python:3.11

WORKDIR /app
ARG REQUIREMENTS
COPY requirements-*.txt ./
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -r ${REQUIREMENTS}
