import { createInterface } from "node:readline";

const input = await new Promise((resolve) => {
  const inputReader = createInterface({ input: process.stdin });
  inputReader.once("line", (value) => {
    inputReader.close();
    resolve(value);
  });
});

const { baseUrl, email, password, organizationId } = JSON.parse(input);

const request = async (path, { cookie, body } = {}) => {
  const response = await fetch(new URL(path, baseUrl), {
    method: body ? "POST" : "GET",
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const data = await response.json().catch(() => null);
  return { response, data };
};

const login = await request("/api/v1/auth/login", {
  body: { email, password },
});
const cookie = login.response.headers.get("set-cookie")?.split(";", 1)[0];
if (login.response.status !== 200 || !cookie) {
  throw new Error(`Login failed with status ${login.response.status}`);
}

const readMemberships = async () => {
  const result = await request("/api/v1/auth/memberships", { cookie });
  if (result.response.status !== 200 || !Array.isArray(result.data?.data)) {
    throw new Error(
      `Membership read failed with status ${result.response.status}`,
    );
  }
  return result.data.data;
};

const activate = async (role) => {
  const result = await request("/api/v1/auth/memberships/activate", {
    cookie,
    body: { organization_id: organizationId, role },
  });
  if (
    result.response.status !== 200 ||
    result.data?.data?.resolved_role !== role
  ) {
    throw new Error(
      `Activation of ${role} failed with status ${result.response.status}`,
    );
  }
  const refreshed = await readMemberships();
  const primary = refreshed.find((membership) => membership.is_primary);
  if (primary?.role !== role) {
    throw new Error(`Role ${role} did not persist after refresh`);
  }
  return {
    role,
    redirectPath: result.data.data.redirect_path,
    persistedAfterRefresh: true,
  };
};

const memberships = await readMemberships();
const availableRoles = memberships
  .filter((membership) => membership.organization_id === organizationId)
  .map((membership) => membership.role)
  .sort();

for (const requiredRole of ["collaborator", "staff"]) {
  if (!availableRoles.includes(requiredRole)) {
    throw new Error(`Required role ${requiredRole} is missing`);
  }
}

const switches = [];
for (const role of ["collaborator", "staff", "collaborator"]) {
  switches.push(await activate(role));
}

const logout = await request("/api/v1/auth/logout", { cookie, body: {} });
const afterLogout = await request("/api/v1/auth/session", { cookie });
if (
  logout.response.status !== 200 ||
  afterLogout.data?.data?.session !== null
) {
  throw new Error("Session remained active after logout");
}

console.log(
  JSON.stringify(
    {
      login: login.response.status,
      availableRoles,
      switches,
      logout: logout.response.status,
      sessionCleared: true,
    },
    null,
    2,
  ),
);
