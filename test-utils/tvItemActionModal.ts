export const tvItemActionModalMock = {
  showItemActions: jest.fn(),
};

/**
 * A useTVItemActionModal module double for TV specs.
 */
export const tvItemActionModalModule = {
  useTVItemActionModal: () => tvItemActionModalMock,
};
