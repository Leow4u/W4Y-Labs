# W4Y model proxy -- LiteLLM in front of OpenRouter.
#
# Base tag: ghcr.io/berriai/litellm:main-stable (LiteLLM's curated stable
# channel; latest release at time of writing: v1.92.0). The tag is a moving
# pointer, but OUR pushed image (registry.fly.io/w4y-model-proxy:mpN) freezes
# the digest -- and per repo rule an mpN tag is NEVER reused (mp1, mp2, ...).
FROM ghcr.io/berriai/litellm:main-stable

COPY config.yaml /app/config.yaml

# The base image ENTRYPOINT is LiteLLM's prod entrypoint (execs the litellm
# CLI); CMD supplies its arguments.
CMD ["--config", "/app/config.yaml", "--port", "4000"]
