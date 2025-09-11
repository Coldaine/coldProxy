import sodiumDefault from "libsodium-wrappers-sumo";

const sodiumReady = (async () => {
  await sodiumDefault.ready;
  return sodiumDefault;
})();

export default async function getSodium() {
  return sodiumReady;
}
