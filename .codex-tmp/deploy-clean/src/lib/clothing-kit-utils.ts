"use client";

export const normalizeKitComponentName = (component: any) => {
  if (typeof component === "string") {
    return component.trim();
  }

  if (component && typeof component === "object") {
    return String(
      component.name ||
        component.title ||
        component.component ||
        component.label ||
        "",
    ).trim();
  }

  return "";
};

export const normalizeKitComponents = (components: any) =>
  Array.isArray(components)
    ? components.map(normalizeKitComponentName).filter(Boolean)
    : [];

export const normalizeKitRecord = (kit: any) => ({
  ...kit,
  components: normalizeKitComponents(kit?.components),
});

export const normalizeKitAssignmentItems = (items: any) => {
  const sourceItems =
    Array.isArray(items) && items.length > 0
      ? items
      : Array.isArray(items?.components)
        ? items.components
        : [];

  return sourceItems
    .map((item: any) => {
      const rawName =
        item && typeof item === "object" && "name" in item ? item.name : item;
      const name = normalizeKitComponentName(rawName);

      if (!name) {
        return null;
      }

      return {
        name,
        delivered: Boolean(
          item?.delivered ||
            item?.selected === true ||
            item?.deliveryStatus === "delivered" ||
            item?.status === "delivered" ||
            item?.status === "completed",
        ),
        deliveredAt: item?.deliveredAt || item?.updatedAt || null,
        size:
          item && typeof item === "object" ? item.size || item.taglia || "" : "",
        jerseyNumber:
          item && typeof item === "object"
            ? item.jerseyNumber ?? item.number ?? null
            : null,
        notes:
          item && typeof item === "object" ? item.notes || item.note || "" : "",
        deliveryStatus:
          item && typeof item === "object"
            ? item.deliveryStatus || item.status || "pending"
            : "pending",
      };
    })
    .filter(Boolean);
};

export const normalizeKitAssignmentRecord = (assignment: any) => ({
  ...assignment,
  components: normalizeKitComponents(assignment?.components),
  items: normalizeKitAssignmentItems(
    Array.isArray(assignment?.items) && assignment.items.length > 0
      ? assignment.items
      : assignment,
  ),
});
