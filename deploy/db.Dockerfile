# PostgreSQL, plus the step that prepares the stack's secrets before it starts
# (see db-entrypoint.sh). Build context: deploy/.
FROM postgres:17-alpine
COPY db-entrypoint.sh /usr/local/bin/waddle-db-entrypoint.sh
RUN chmod 755 /usr/local/bin/waddle-db-entrypoint.sh
ENTRYPOINT ["waddle-db-entrypoint.sh"]
# Setting ENTRYPOINT clears the base image's CMD, so name it again.
CMD ["postgres"]
