import React from 'react'
import '../../assets/stylesheets/application.css';
import { checkWeb3, getNetworkVersion, } from '../../utils/blockchainHelpers'
import { Link } from 'react-router-dom';
import { setFlatFileContentToState, toast } from '../../utils/utils';
import { StepNavigation } from '../Common/StepNavigation';
import { NAVIGATION_STEPS, TOAST } from '../../utils/constants';
import { inject, observer } from 'mobx-react';
import { getWhiteListWithCapCrowdsaleAssets } from '../../stores/utils'
const { CROWDSALE_CONTRACT } = NAVIGATION_STEPS;

const DOWNLOAD_STATUS = {
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILURE: 'failure'
}

const ContinueButton = ({downloadStatus}) => {
  return (
    <Link to="/2">
      <span className="button button_fill">Continue</span>
    </Link>
  );
};

@inject('contractStore', 'web3Store', 'generalStore') @observer
export class stepOne extends React.Component {

  constructor() {
    super()

    this.state = {
      contractsDownloaded: DOWNLOAD_STATUS.PENDING
    }
  }

  /*getWhiteListWithCapCrowdsaleAssets () {
    return Promise.all([
      this.getCrowdsaleAsset("REACT_APP_REGISTRY_STORAGE", "registryStorage"),
      this.getCrowdsaleAsset("REACT_APP_INIT_REGISTRY", "initRegistry"),
      this.getCrowdsaleAsset("REACT_APP_INIT_CROWDSALE", "initCrowdsale"),
      this.getCrowdsaleAsset("REACT_APP_CROWDSALE_CONSOLE", "crowdsaleConsole"),
      this.getCrowdsaleAsset("REACT_APP_SCRIPT_EXEC", "scriptExec"),
    ])
  }

  getCrowdsaleAsset(contractName, stateProp) {
    const src = "" //to do
    const bin = process.env[`${contractName}_BIN`] || ''
    const abi = JSON.parse(process.env[`${contractName}_ABI`] || [])
    const addr = JSON.parse(process.env[`${contractName}_ADDRESS`] || {})

    return Promise.all([src, bin, abi, addr])
      .then(result => this.addContractsToState(...result, stateProp))
  }

  addContractsToState(src, bin, abi, addr, contract) {
    this.props.contractStore.setContract(contract, {
      src,
      bin,
      abi: abi,
      addr: addr,
      abiConstructor: []
    });
  }*/

  componentDidMount() {
    let { generalStore,web3Store } = this.props;
    checkWeb3(web3Store.web3);

    getNetworkVersion().then(networkID => {
      generalStore.setProperty('networkID', networkID)
      getWhiteListWithCapCrowdsaleAssets(networkID)
    }).then(
        () => {
          this.setState({
            contractsDownloaded: DOWNLOAD_STATUS.SUCCESS
          })
        },
        (e) => {
          console.error('Error downloading contracts', e)
          toast.showToaster({
            type: TOAST.TYPE.ERROR,
            message: 'The contracts could not be downloaded.Please try to refresh the page. If the problem persists, try again later.'
          })
          this.setState({
            contractsDownloaded: DOWNLOAD_STATUS.FAILURE
          })
        }
      )
  }

  render() {
    return (
       <section className="steps steps_crowdsale-contract">
       <StepNavigation activeStep={CROWDSALE_CONTRACT}/>
        <div className="steps-content container">
          <div className="about-step">
            <div className="step-icons step-icons_crowdsale-contract"></div>
            <p className="title">Crowdsale Contract</p>
            <p className="description">
              Select a strategy for your crowdsale contract.
            </p>
          </div>
          <div className="radios">
            <label className="radio">
              <input
                type="radio"
                defaultChecked={true}
                name="contract-type"
                id="white-list-with-cap"
              />
              <span className="title">Whitelist with Cap</span>
              <span className="description">
                Modern crowdsale strategy with multiple tiers, whitelists, and limits. Recommended for every crowdsale.
              </span>
            </label>
          </div>
        </div>
        <div className="button-container">
          <ContinueButton downloadStatus={this.state.contractsDownloaded} />
        </div>
      </section>
    )
  }
}
