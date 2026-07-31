-- Erasing a person detaches their commercial record instead of destroying it.
--
-- Deleting a customer used to require deleting their deals and repair orders,
-- because both columns were NOT NULL. That threw away the accounting and
-- warranty trail along with the person. They are now nullable, so an erase can
-- orphan them: the deal still exists, still totals, and can be re-attached to
-- the right customer by hand if the deletion turns out to have been a mistake
-- or a duplicate.
--
-- The foreign keys deliberately stay ON DELETE RESTRICT rather than becoming
-- SET NULL. Detaching must remain a deliberate act performed by the erase flow;
-- with SET NULL any stray user delete anywhere in the codebase would silently
-- orphan a customer's whole history instead of being refused.
--
-- Widening a column to nullable rewrites no rows and takes no long lock, so
-- this is safe to deploy while the shop is live. Existing rows keep their
-- customer.

ALTER TABLE "Deal" ALTER COLUMN "customerUserId" DROP NOT NULL;
ALTER TABLE "RepairOrder" ALTER COLUMN "userId" DROP NOT NULL;
