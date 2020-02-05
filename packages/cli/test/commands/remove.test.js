'use strict';
require('../setup');

import { stubCommands, itShouldParse } from './share';

describe('remove command', function() {
  stubCommands();

  itShouldParse('should call remove script', 'remove', 'oz remove Impl', function(remove) {
    remove.should.have.been.calledWithExactly({ contracts: ['Impl'] });
  });

  itShouldParse('should call push script when passing --push option', 'push', 'oz remove Impl --push test', function(
    push,
  ) {
    push.should.have.been.calledWithExactly([], {
      deployProxyAdmin: undefined,
      deployProxyFactory: undefined,
      deployDependencies: true,
      force: undefined,
      reupload: undefined,
      network: 'test',
      txParams: {},
    });
  });
});
