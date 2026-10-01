import { createSubmission } from "./submission";

// A TV sheet's one action at a time: Android TV can deliver one press twice
// in the same batch, and an answer that comes after the sheet is gone must
// not close whatever screen is there by then.
describe("createSubmission", () => {
  test("lets one through while it runs, then the next", () => {
    const submission = createSubmission();
    expect(submission.start()).toBe(true);
    expect(submission.start()).toBe(false);
    submission.finish();
    expect(submission.start()).toBe(true);
  });

  test("says the sheet is still there when it ends", () => {
    const submission = createSubmission();
    submission.start();
    expect(submission.finish()).toBe(true);
  });

  test("answers nothing once the sheet is gone", () => {
    const submission = createSubmission();
    submission.start();
    submission.dismiss();
    expect(submission.finish()).toBe(false);
    expect(submission.start()).toBe(false);
  });

  test("dismisses once", () => {
    const submission = createSubmission();
    expect(submission.dismiss()).toBe(true);
    expect(submission.dismiss()).toBe(false);
  });

  // React runs a mount effect's cleanup and setup again without unmounting,
  // under Fast Refresh and StrictMode: the sheet is still there after that.
  test("takes actions again once shown again", () => {
    const submission = createSubmission();
    submission.dismiss();
    submission.show();
    expect(submission.start()).toBe(true);
    expect(submission.dismiss()).toBe(true);
  });
});
