const { createClient } = require("redis");

function Presence() {
  this.client = createClient({
    url: "rediss://rtc-redis-test-w0htzp.serverless.apse1.cache.amazonaws.com:6379",
  });

  // Connect the Redis client
  this.client.connect().catch((err) => {
    console.error("Redis connection error:", err);
  });
}

module.exports = new Presence();

/**
 * Remember a present user with their connection ID
 *
 * @param {string} connectionId - The ID of the connection
 * @param {object} meta - Any metadata about the connection
 **/
Presence.prototype.upsert = async function (connectionId, meta) {
  try {
    await this.client.hSet(
      "presence",
      connectionId,
      JSON.stringify({
        meta: meta,
        when: Date.now(),
      })
    );
  } catch (err) {
    console.error("Failed to store presence in Redis:", err);
  }
};

/**
 * Remove a presence. Used when someone disconnects
 *
 * @param {string} connectionId - The ID of the connection
 **/
Presence.prototype.remove = async function (connectionId) {
  try {
    await this.client.hDel("presence", connectionId);
  } catch (err) {
    console.error("Failed to remove presence in Redis:", err);
  }
};

/**
 * Returns a list of present users, minus any expired
 *
 * @param {function} returnPresent - callback to return the present users
 **/
Presence.prototype.list = async function (returnPresent) {
  const active = [];
  const dead = [];
  const now = Date.now();

  try {
    const presence = await this.client.hGetAll("presence");

    for (const connection in presence) {
      const details = JSON.parse(presence[connection]);
      details.connection = connection;

      if (now - details.when > 8000) {
        dead.push(details);
      } else {
        active.push(details);
      }
    }

    if (dead.length) {
      this._clean(dead);
    }

    returnPresent(active);
  } catch (err) {
    console.error("Failed to get presence from Redis:", err);
    returnPresent([]);
  }
};

/**
 * Cleans a list of connections by removing expired ones
 *
 * @param {Array} toDelete - List of expired connections to remove
 **/
Presence.prototype._clean = function (toDelete) {
  console.log(`Cleaning ${toDelete.length} expired presences`);
  for (const presence of toDelete) {
    this.remove(presence.connection);
  }
};
